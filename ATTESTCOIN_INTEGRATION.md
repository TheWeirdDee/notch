# Attestcoin integration

How Notch turns a real Ethereum transaction into on-chain financing capacity on
Creditcoin, and exactly where that guarantee stops. Accurate to
`contracts/src/AttestedCashflowRegistry.sol` as deployed (Gate 6 fixed contracts,
`GATES.md`).

## The verify → decode → instantiate path

`instantiateClaim` takes a Sablier creation transaction's proof material (chain key,
header number, raw `txBytes`, Merkle proof, continuity proof) and a requested stream
id — never an amount, never a typed capacity figure. In order, on-chain:

1. **`verifyAndEmit`** — the BlockProver precompile (`0x0000000000000000000000000000000000000FD2`)
   verifies the Merkle and continuity proof for `txBytes` at the given header. A failed
   verification reverts `VerificationFailed()` before anything else happens — no
   capacity is ever created from an unverified transaction.
2. **Receipt status check** — the EVM decoder (`0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f`)
   decodes the proven transaction's receipt fields. `receiptStatus != 1` reverts
   `ReceiptNotSuccess()`. Inclusion is not success; both are checked, separately.
3. **Event decode** — the registry scans the decoded receipt's logs for
   `CreateLockupLinearStream` (topic0 `0xbc42cec3f2bd75ce97894dacc83ec6c4b682220d349b5a52d5743e7b46eba2d0`)
   matching the requested stream id, and ABI-decodes the event's own data — deposit
   amount, recipient, token, cancelable/transferable flags, lock timestamps, unlock
   amounts. Nothing here reads calldata for these fields, and there is no
   `totalAmount` field anywhere in the decoded struct to misread.
4. **Shape checks** — source contract allowlisted (`0xe61cb9153356419bdaD0A8767c059f92d221a3C4`,
   Sablier Lockup v4.0 on Sepolia), chain key equals the confirmed value (`1`,
   verified live against the ChainInfo precompile — see `DECISIONS.md` D6, not
   assumed from docs), non-cancelable, non-transferable, zero unlock amounts, a cliff
   strictly in the future.
5. **Claim identity** — `claimId = keccak256(chainKey, keccak256(txBytes), streamId)`.
   The caller-supplied display transaction hash has no cryptographic role in this —
   see the source comment at the claimId derivation for why (a caller-supplied hash
   with no tie to `txBytes` would let one real position mint unlimited claims).

## The calldata fallback: not implemented, not merely untested

`Notch-PRD.md` Appendix D describes an optional fallback — if the `CreateLockupLinearStream`
event is unexpectedly absent from a proven transaction's logs, fall back to
calldata fields the receipt still authenticates, rather than failing outright.

**That fallback does not exist in the deployed contract.** `instantiateClaim` has
exactly one decode path (step 3 above); if the event isn't found in the decoded
logs, the function reverts `EventNotFound()`. There is no calldata-reading code
anywhere in `AttestedCashflowRegistry.sol` to test, exercise, or rely on. This is
more conservative than an implemented-but-unverified fallback would be — a missing
event fails closed instead of falling back to a second, less-verified decode
path — but it is also a real gap against the PRD's original description, recorded
here rather than left implicit. In practice, every real Sablier v4.0 creation
transaction emits this event, so the gap has not been hit; it should not be assumed
resolved.

## Guarantees and boundaries

| Enforced by this integration | Outside its scope |
|---|---|
| **Inclusion is checked, and separately, so is success.** `verifyAndEmit` proves the transaction was *included* and mined; that alone says nothing about whether it *succeeded*. `receiptStatus != 1` (step 2) is a distinct, separate check — a proven-included-but-reverted transaction still creates zero capacity | Current state or anything after inclusion — Attestcoin proves a historical fact about one transaction, not a live view of the source chain |
| Capacity comes from a decoded, receipt-status-success, freshly-reverified transaction — never typed, never cached | Repayment, credit risk, collateral recovery |
| A blocked or failed Attestcoin proof creates zero capacity — no fallback mints a claim without one | The same real-world cashflow presented to a different system outside this registry |
| Aggregate financing across any number of lenders stays within the claim's decoded capacity, enforced atomically with the ccUSD transfer | Outbound writes back to the source chain — Attestcoin's current release is read-only, Ethereum to Creditcoin; repayment flows are v2 scope |
| Proof freshness enforced before every real on-chain use (D12/D26) — a stale proof is refetched, never replayed | A calldata-decode fallback for a missing event — not implemented (see above) |

## Verifying a claim's numbers independently

`available()` is always `originalCapacity − financedCapacity`, computed by the
registry contract itself:

```sh
cast call <REGISTRY_ADDRESS> "claims(bytes32)" <claimId> \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network

cast call <REGISTRY_ADDRESS> "available(bytes32)(uint128)" <claimId> \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network
```

Every ledger receipt (`data/ledger.jsonl`) independently recomputes from its own
recorded proof inputs via `notch verify <receipt_id>` — it reruns the pure reference
model (`core/src/instantiate.ts` / `core/src/apply.ts`), not the app's own arithmetic.
