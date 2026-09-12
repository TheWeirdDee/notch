# Notch reference model

This is the spec `AttestedCashflowRegistry` and `CashflowLendingVenue` (Gate 3) must
match. It is not documentation of the contracts — it comes first, per `Notch-PRD.md`
section 16 and the Gate 2 build order. The Solidity contracts are checked against this
model's fixture pack once they exist; this model is not checked against them.

Executable implementation: `src/instantiate.ts`, `src/apply.ts`. Types: `src/types.ts`.
Configuration constants: `src/constants.ts`. Fixture pack: `fixtures/*.json` with golden
expected outputs in `fixtures/golden/*.json`, exercised by `src/model.test.ts`.

## Determinism rules (hard)

- Pure JSON in, pure JSON out. Every field on `Proof`, `Claim`, and `Loan` is a string,
  number, or boolean — no `bigint`, no `Date`, nothing that doesn't round-trip through
  `JSON.stringify`/`JSON.parse` unchanged.
- No network calls inside `instantiate` or `apply`. Both functions receive the *results*
  of external verification (precompile calls, event decoding) as input fields; they
  never call a precompile, a decoder, or an RPC themselves.
- No clock calls inside. `now_at_instantiation` and `received_at` are input fields on
  `Proof`, supplied by the caller, never read from `Date.now()` internally.
- Same input always produces the same output. `src/model.test.ts` asserts this directly
  (`describe("determinism")`) in addition to the fixture pack.

## Why `instantiate` and `apply` take extra state parameters

The gate's brief writes the signatures as `instantiate(proof) -> Claim` and
`apply(loan, claim) -> Claim`. `apply` already takes the claim it's judging against as
an explicit argument. `instantiate` needed the same treatment for one reason: the
contract's replay guard reads `claims[claimId].active` from storage before creating a
claim (Appendix C step 10), and a pure function can't read storage — so the model takes
that same fact as an explicit input instead of hiding it as module state:

```ts
instantiate(proof: Proof, priorClaim: Claim | null = null): InstantiateResult
apply(loan: Loan, claim: Claim): ApplyResult
```

`priorClaim` is "whatever is currently stored at this claimId, if anything" — `null` for
a claimId nobody has used yet, or the previously-instantiated `Claim` for a replay
attempt. This is the pure-model equivalent of a storage read, not a scope change: same
inputs still always produce the same output. Recorded in `DECISIONS.md`.

## `instantiate(proof, priorClaim) -> InstantiateResult`

Checks run in this exact order; the first failing check determines the rejection
reason. Gate 3's `instantiateClaim` rejects for the same reason at the same relative
point (its Solidity comments are numbered to match).

| # | Check | Reject reason | Gate 3 step |
|---|---|---|---|
| 1 | `proof.precompileAvailable` | `PRECOMPILE_UNAVAILABLE` | (implicit — the call itself must succeed before step 1) |
| 2 | `proof.proofVerified` | `PROOF_NOT_VERIFIED` | 1 |
| 3 | `proof.receiptStatus === 1` | `RECEIPT_NOT_SUCCESS` | 2 |
| 4 | `proof.sourceContract === ALLOWLISTED_SABLIER_LOCKUP` (case-insensitive) | `SOURCE_CONTRACT_NOT_ALLOWLISTED` | 4 |
| 5 | `proof.chainKey === EXPECTED_CHAIN_KEY` | `CHAIN_KEY_MISMATCH` | 5 |
| 6 | `proof.cancelable === false` | `CANCELABLE_NOT_ALLOWED` | 6 |
| 7 | `BigInt(proof.depositAmount) > 0n` | `DEPOSIT_NOT_POSITIVE` | 7 |
| 8 | `proof.token === APPROVED_DEMO_ASSET` (case-insensitive) | `TOKEN_NOT_APPROVED` | 8 |
| 9 | `unlockAmounts.start === 0 && unlockAmounts.cliff === 0` | `UNLOCK_AMOUNTS_NOT_ZERO` | 9 |
| 10 | `proof.cliffTime > proof.now_at_instantiation` | `CLIFF_NOT_FUTURE` | 10 |
| 11 | `!(priorClaim && priorClaim.active)` | `CLAIM_ALREADY_ACTIVE` | 11 |

Checks 1, 4, and 5 are not independent numbered steps in the PRD's original Appendix C
pseudocode; each is recorded as a clarification in `DECISIONS.md` rather than a silent
addition:

- **Check 1 (`precompileAvailable`)** models the precompile call being unreachable at
  all (Attestcoin down), which is a different failure mode from the call executing and
  returning `false` (check 2). The `missing-precompile` and `fake-merkle-proof`
  fixtures are deliberately kept distinct to prove the model tells them apart.
- **Checks 4-5 (`sourceContract`, `chainKey`)**: this model originally checked
  `chainKey` before `sourceContract` (Gate 2). Gate 3's explicit numbered contract spec
  reversed that order; the model was updated to match rather than left to silently
  diverge (`DECISIONS.md` D11) — no fixture flips both fields at once, so no golden file
  changed. Neither check is one of Appendix C's original four shape bullets, but both
  are required: `sourceContract` by the `wrong-source-contract` fixture, `chainKey` by
  the `wrong-chain-key` fixture and by `Notch-PRD.md` Appendix D ("confirm against
  ChainInfo... do not assume it"). The same contract bytecode can in principle be
  deployed at the same address on more than one chain (e.g. via `CREATE2`); the chainKey
  check is what stops a genuinely-verified proof of a transaction on the wrong chain
  from being accepted as if it were Sepolia's. `EXPECTED_CHAIN_KEY = 1`, confirmed live
  against the ChainInfo precompile in Gate 1 (`DECISIONS.md` D6,
  `data/gate1/chain-key.json`), not assumed from docs.

**Layering note (Gate 3, `DECISIONS.md` D11):** the deployed contract does not use
`proof.sourceTxHash` for claimId uniqueness the way this pure model does. On real bytes,
a caller-supplied "sourceTxHash" has no cryptographic tie to `txBytes`, so trusting it
for replay-protection would let one verified transaction mint unlimited claims under
different claimed hashes. The contract derives claimId from `keccak256(chainKey,
keccak256(txBytes), streamId)` instead, and stores the caller-supplied hash separately,
for display only. This model still takes `proof.sourceTxHash` as an already-trustworthy
input, because the model reasons about decoded *facts*, not about how those facts get
authenticated from raw proof bytes — a layer below what this model operates at.

**Capacity, invariant 2:** `originalCapacity` is set to `proof.depositAmount` — the
decoded Sablier `CreateLockupLinearStream` **event** deposit, after fees. `proof` may
carry a `totalAmount` field (present only in the `broker-fee-total-amount` fixture); no
code path reads it. See the `broker-fee-total-amount` fixture and its dedicated
assertion in `model.test.ts`.

**claimId encoding**, pinned so Gate 3 computes the identical value:

```
claimId = keccak256(abi.encodePacked(uint32 chainKey, bytes32 sourceTxHash, uint256 streamId))
```

Implemented in `src/claim-id.ts` via viem's `encodePacked` + `keccak256` — pure hashing,
no network call.

**On success**, the claim is:

```
claimId, sourceChainKey: proof.chainKey, sourceTxHash, sourceContract,
streamId, borrower: proof.recipient, asset: proof.token,
originalCapacity: proof.depositAmount, financedCapacity: "0",
lockedUntil: proof.cliffTime, active: true
```

## `apply(loan, claim) -> ApplyResult`

The reference model of `CashflowLendingVenue.finance()` (Appendix C): consume-then-
transfer, one atomic step. Checks run in this order — `viaAuthorizedVenue` first,
because the real `onlyVenue` modifier on `registry.consume()` gates entry to the whole
function before its body (and therefore before the `active`/amount checks) ever runs:

| # | Check | Reject reason |
|---|---|---|
| 1 | `loan.viaAuthorizedVenue` | `UNAUTHORIZED_CALLER` |
| 2 | `claim.active` | `CLAIM_INACTIVE` |
| 3 | `BigInt(loan.amount) > 0n` | `AMOUNT_NOT_POSITIVE` |
| 4 | `BigInt(loan.amount) <= available(claim)` | `INSUFFICIENT_CAPACITY` |
| 5 | `loan.transferWouldSucceed` | `TRANSFER_WOULD_FAIL` |

`available(claim) = BigInt(claim.originalCapacity) - BigInt(claim.financedCapacity)`.

Check 3 (`amount > 0`) is not spelled out in Appendix C's terse `consume()` comment, but
is required by this gate's own instructions and the `zero-amount` fixture — recorded in
`DECISIONS.md` as the reading Gate 3 must match.

Check 5 (`transferWouldSucceed`) models `ccUSD.transferFrom(lender, borrower, amount)`
potentially failing (e.g. insufficient lender allowance) even though capacity was
available — "a failed transfer reverts the capacity change," so on this branch
`financedCapacity` does not move. No fixture in the required pack exercises this branch
by name (it isn't one of the sixteen named cases); the check exists because it's part of
the permit formula the gate specified, and every other `apply` fixture implicitly
exercises the `true` path.

**On success:** `financedCapacity` becomes `financedCapacity + amount`; every other
field is unchanged.

## Fixture pack (16 cases)

Each case is `fixtures/<name>.json` (input) and `fixtures/golden/<name>.json` (expected
output, generated once from a reviewed run via `npm run generate-golden` and manually
checked before being committed as ground truth). `src/model.test.ts` re-runs every
fixture and asserts the live result still equals its golden file.

| Case | Operation | Proves |
|---|---|---|
| `wrong-chain-key` | `instantiate` | Rejected even with `proofVerified: true` |
| `failed-receipt` | `instantiate` | Reverted create (`receiptStatus: 0`) creates no claim |
| `cancelable-stream` | `instantiate` | `cancelable: true` rejected |
| `non-zero-unlock` | `instantiate` | Non-zero `unlockAmounts.start` rejected |
| `past-cliff` | `instantiate` | `cliffTime <= now_at_instantiation` rejected |
| `wrong-source-contract` | `instantiate` | Non-allowlisted source (a real, but wrong, pinned address) rejected |
| `broker-fee-total-amount` | `instantiate` | Succeeds; `originalCapacity` = event deposit, never `totalAmount` |
| `fake-merkle-proof` | `instantiate` | `proofVerified: false` rejected |
| `missing-precompile` | `instantiate` | `precompileAvailable: false` rejected, distinct reason from above |
| `replay` | `instantiate_twice` | First succeeds; identical second attempt rejected (`CLAIM_ALREADY_ACTIVE`) |
| `zero-amount` | `apply` | `amount: 0` rejected |
| `exact-remainder` | `apply` | Financing exactly what's left succeeds; available -> 0 |
| `remainder-plus-one` | `apply` | Financing remainder + 1 unit rejected |
| `two-lender-race` | `apply_sequence` | First lender's 70,000 succeeds; second lender's 50,000 against the 30,000 left is rejected (PRD's own demo numbers) |
| `inactive-claim` | `apply` | Financing a claim with `active: false` rejected |
| `unauthorized-venue` | `apply` | A call not routed through the authorized venue rejected |

Where a real decoded value exists (the Gate 1 Sablier stream, tx
`0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8`, stream 177), the
fixtures use it. Purely negative or hypothetical states (an inactive claim, placeholder
lender addresses, a shifted `now_at_instantiation`) are marked `"synthetic": true` with a
`"note"` explaining exactly what was changed from the real record and why — no fixture
claims to be real when it isn't.

## Pass bar

- Every fixture's live result equals its golden file (`model.test.ts`, 16 cases).
- Over-draw is rejected (`remainder-plus-one`, `two-lender-race`).
- Re-instantiation of the same source is rejected (`replay`).
- A failed receipt creates no claim (`failed-receipt`).
- The broker-fee fixture proves capacity = event deposit, not `totalAmount`
  (`broker-fee-total-amount`).
- The model's permit conditions (the two tables above) are the literal spec Gate 3's
  contract is tested against — not a paraphrase of it.
