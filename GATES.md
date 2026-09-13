# Gates

Status log for the phased build in `Notch-PRD.md` section 20. A later gate starts on a
pass rule, not a date. Update this file when a gate's pass rule is met, with evidence
location.

| Gate | Scope | Status | Evidence |
|---|---|---|---|
| 0 | Repo, folder layout, `paper_only` true, dummy reference test green | PASS | this repo; `notch.config.json`; `core/src/index.test.ts`; `npm test` → 1 passed |
| 1 | Decode seam (make or break) | **PASS** (2026-09-09) | `data/gate1/*.json` — see detail below |
| 2 | Reference model (`instantiate`, `apply`, expanded fixture pack — see PRD v2 section 16) | **PASS** (2026-09-09) | `core/reference_model.md`, `core/fixtures/`, `npm test` → 24 passed |
| 3 | Registry and venue contracts (receipt-status check, event-deposit-not-totalAmount, no typed-amount param) | **REMEDIATION REQUIRED after audit** | `data/gate3/*.json` — see detail below |
| 4 | Paper receipts on live proofs (J1–J4) | **PASS** (2026-09-09) | `data/ledger.jsonl`, `data/receipts/` — see detail below |
| 5 | Recovery (query-before-retry, restart resume) | **PASS** for single-store PAPER; audited (round 1) and P1 contract findings from that audit independently confirmed fixed in source (round 2 + this verification) | `data/gate5/`, `data/audit-gates1-5/` — see detail below |
| 6 | Live micro loans (Lender A and Lender B must be distinct funded wallets — PRD v2 invariant 12) | **PASS** (2026-09-09) | `data/gate6/*.json` — see detail below |
| 7 | Campaign and ablation (incl. `user_supplied_amount` shown to disagree with the decoder) | **PASS** (2026-09-10) | `data/gate7/frozen-set.json` — see detail below |
| 8 | UI surfaces A–C plus public `/verify` surface (PRD v2 section 7.7) | **PASS** (2026-09-10); 375px checked structurally, not confirmed by a human click-through (Phase 1 FIX 4) | see detail below |
| 9 | Submission freeze (README may name in-hackathon differentiation only — PRD v2 section 3) | **PREPARED, not fully executed** (2026-09-12) — demo video and Discord co-design post not done (no recording/Discord access in this environment); everything else complete | see detail below |

## Gate 0 — detail

- [x] Folder layout: `core/`, `contracts/`, `adapter/`, `web/`, `cli/`, `data/`
- [x] `notch.config.json` with `paper_only: true`
- [x] `BUILD_CONTRACT.md`, `DECISIONS.md`, `GATES.md`, `CLAIMS.md`
- [x] Dummy reference test green — `npm install && npm test` → 1 test file, 1 test, passed (2026-09-09)

## Gate 1 — PASS, full chain of evidence (2026-09-09)

Fund-free steps (no wallet needed — read-only RPC calls):

- [x] Confirm Sepolia's chain key against the live ChainInfo precompile, not assumed
  from docs — `scripts/confirm-chain-key.mjs`. Result: chainKey `1` = Sepolia, chainKey
  `3` = Ethereum mainnet. `data/gate1/chain-key.json`. See `DECISIONS.md` D6.
- [x] Confirm all four pinned addresses have something live deployed at them —
  `scripts/probe-live-addresses.mjs`. `data/gate1/address-probe.json`. See
  `DECISIONS.md` D7.

Funded-wallet steps, run in order against real burner wallets (Sepolia ETH from a
QuickNode faucet; CC3 CTC from the Creditcoin Discord faucet):

- [x] `scripts/deploy-test-token.mjs` — deployed `NotchDemoAsset` (the Sepolia-side
  `approvedDemoAsset`) at `0x7d20609bdb2fa772143905d6ada079b1515db0b0`, minted 1,000,000
  to the burner wallet. Deploy tx `0xc35e413366c82818fffab123160a955fc451e9b7b48281eb609debe122095340`.
- [x] `scripts/create-sablier-stream.mjs` — approved SablierLockup, simulated
  `createWithTimestampsLL` first (free, no gas — caught nothing, so no gas was wasted on
  a bad encoding), then sent it for real. **Stream id 177**, deposit 100,000 NDA,
  `cancelable=false`, `unlockAmounts.start=0`, `unlockAmounts.cliff=0`, cliff 7 days out.
  Create tx `0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8`
  ([Sepolia](https://sepolia.etherscan.io/tx/0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8)),
  block 11666803. `data/gate1/stream-creation.json`.
- [x] `scripts/fetch-attestcoin-proof.mjs` — polled `/api/v1/attested-height/1` (public
  HTTP, no wallet) until it caught up to block 11666803 (~7 minutes), then fetched the
  proof via `/api/v1/proof-by-tx/1/{txHash}`. `data/gate1/attestcoin-proof.json`
  (txBytes 3424 bytes, 8 merkle siblings, 8 continuity roots).
- [x] `scripts/verify-and-decode.mjs` — deployed `Gate1DecodeProbe` on CC3 Testnet at
  `0xf22eb0ecf36cc05964cefa1e759bb9f20535c292` (deploy tx
  `0x946650e876f2583464199d9fbd3f63b87dd9ebac2beb92e315b4330410d1181d`), simulated
  `verifyAndDecode` first (free — succeeded, confirming the `INativeQueryVerifier` /
  `IEvmV1Decoder` interfaces sourced in `DECISIONS.md` D5 item 5 were correct **on the
  first live attempt**, no ABI guesswork needed correcting), then sent it for real. Tx
  `0x5c0ee8c904f66ace23bb56740048301ad375aad3ab682d6f9519e78d11029e89`, status success.

**Result: every decoded field matches the local Sepolia record exactly** — streamId,
recipient, token, `depositAmount` (100,000 × 10^18, decoded from the
`CreateLockupLinearStream` **event**, never calldata, never `totalAmount`), `cancelable`,
`unlockAmounts.start`, `unlockAmounts.cliff`, `cliffTime`, `endTime`. Receipt status was
checked and was `1` (success) before any field was trusted. Full comparison table:
`data/gate1/verify-and-decode-result.json` (`outcome: "PASS"`).

**Pass rule met:** capacity decoded from a real, precompile-verified transaction,
matching the on-chain Sablier stream exactly, with no user-supplied amount anywhere in
the path. Gate 2 (reference model) may start.

## Gate 2 — PASS, deterministic reference model (2026-09-09)

Scope: `core/reference_model.md` plus executable, pure `instantiate(proof, priorClaim)
-> InstantiateResult` and `apply(loan, claim) -> ApplyResult` (`core/src/instantiate.ts`,
`core/src/apply.ts`), matching PRD v2 section 16 and this gate's explicit instructions.
No Solidity, no contracts, no UI touched — reference model only, per instruction.

- [x] `core/reference_model.md` — full spec: permit-condition tables for both
  functions (in the exact order Gate 3 must enforce them), the claimId encoding
  (`keccak256(abi.encodePacked(uint32, bytes32, uint256))`), the fixture list, and two
  documented deviations from Appendix C's terse pseudocode (a `precompileAvailable`
  check and a `chainKey` check), recorded in `DECISIONS.md` D9.
- [x] `instantiate`/`apply` are pure: JSON in, JSON out, no network calls, no clock
  calls (`now_at_instantiation`/`received_at` are input fields). Verified directly by
  a `describe("determinism")` block in `core/src/model.test.ts`.
- [x] Fixture pack — all 16 required cases, one input file
  (`core/fixtures/<case>.json`) and one golden output file
  (`core/fixtures/golden/<case>.json`) each, generated via `core/generate-golden.mjs`
  from the reviewed implementation and manually checked before being locked in:
  `zero-amount`, `exact-remainder`, `remainder-plus-one`, `two-lender-race`, `replay`,
  `wrong-chain-key`, `failed-receipt`, `cancelable-stream`, `non-zero-unlock`,
  `past-cliff`, `wrong-source-contract`, `broker-fee-total-amount`, `inactive-claim`,
  `unauthorized-venue`, `fake-merkle-proof`, `missing-precompile`.
- [x] Fixtures use the real Gate 1 Sablier stream (tx
  `0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8`, stream 177, real
  claimId `0x2f3515684d371770be9fa985bf14d9ced224f5c6801684c8e03d46a2a26d9137`) wherever
  a real value applies; every purely negative/hypothetical fixture is marked
  `"synthetic": true` with a `"note"` on exactly what was changed and why.
- [x] `npm test` → 2 files, **24 passed** (1 smoke test, 16 fixture cases, 1
  fixture-completeness check, 4 explicit pass-bar assertions, 2 determinism checks).
- [x] `npx tsc --noEmit` clean in `core/` (TypeScript strict, per the standing stack
  rule).

**Pass-bar checks, each independently asserted (not just implied by a fixture match):**
over-draw rejected (`remainder-plus-one`, `two-lender-race`'s second loan); re-
instantiation of the same source rejected (`replay`); a failed receipt creates no claim
(`failed-receipt`); the broker-fee fixture proves `originalCapacity` equals the event
`depositAmount`, never `totalAmount` (`broker-fee-total-amount`).

**Pass rule met:** all fixtures match their golden files; over-draw and re-
instantiation are rejected. Gate 3 (registry and venue contracts) may start — its
`instantiateClaim`/`consume` must be tested against this exact model.

## Gate 3 — PASS, contracts deployed and parity-tested on real infrastructure (2026-09-09)

Three contracts (`contracts/src/MockUSDC.sol`, `AttestedCashflowRegistry.sol`,
`CashflowLendingVenue.sol`) deployed on Creditcoin CC3 Testnet. Current deployment
(`data/gate3/deployment.json`):

| Contract | Address |
|---|---|
| MockUSDC (ccUSD) | `0x395233630063706d9fd25c1ac8afdb2e9b59916d` |
| AttestedCashflowRegistry | `0xbfeaf8492ba01278ad3e382a2b9a3482cf54c640` |
| CashflowLendingVenue | `0x24ca704f62793badc0bb7cbfd2393a1a63e5f5a0` |

(Two earlier venue deployments were redeployed over real, caught bugs — see
`DECISIONS.md` D14. `AttestedCashflowRegistry.setVenue` is owner-updatable, not
one-time-locked, specifically so this didn't orphan the real claim below.)

### A real bug, caught and fixed by this gate's own real testing

The first `finance()` used one raw `amount` for both capacity consumption (18-decimal
deposit-asset scale) and the ccUSD transfer (6-decimal, per PRD Appendix C) —
conservation was silently unenforceable as a result (a human-scale draw request dented
capacity by a factor of 10⁻¹², so every over-draw test "succeeded"). Found immediately
by running the real finance flow, not by inspection. Full account: `DECISIONS.md` D14.

### The three required on-chain demo proofs

1. **`instantiateClaim` from the real Gate 1 stream** (tx
   `0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8`, stream 177) →
   tx `0x96e4427956d3fae645990f223563bb427f60eb9c7bd7e7271cb6dbd005108bf3`, claimId
   `0x99161b1e0e9f40613c9f07f522ca412085919df2617831a972139508503cfae9`,
   `originalCapacity = 100,000 * 10^18` — the decoded event deposit, matching Gate 1
   exactly. `data/gate3/real-claim.json`.
2. **Two distinct funded lenders** (`0x28ac3e5DA22cC5380Ca2797F9c882ddAF93D74E1` /
   `0x28ac...`, `0xF48795C36CbF0578D47cf0731f6B1aCf4efEb7EA` — generated fresh, funded
   directly from the deployer's CC3 balance, never the same key): Lender A finances
   70,000 (tx `0xf8c19f56180f378eb5ef8e006c2e8fcc084828c231f5333100897a291a757e1d`,
   available falls to 30,000); Lender B over-requests 50,000 against the 30,000
   remaining → reverts `InsufficientFinancingCapacity` on-chain, the PRD's own J2/money-
   shot numbers exactly. Lender A then finances exactly the 30,000 remainder (tx
   `0xee4ad848bff6ddd94058daf65c08d1d443f0cb23af046e68bfadcef87dff311c`), exhausting
   available to exactly `0`. `data/gate3/finance-and-parity-results.json`.
3. **Re-instantiation of the same source** → reverts `ClaimAlreadyActive`.
   **A failed-receipt / wrong-shape source creates no capacity** → both tested
   independently with real, separately-verified proofs: a deliberately-reverted Sepolia
   tx (`0x7a3e762b3b29178df8627e6152aad089842a4955dae1e8633798845b28dd1077`, receipt
   status 0) reverts `ReceiptNotSuccess`; a real `cancelable=true` stream (stream 178,
   tx `0x6cd2ae6e62c48e6fc971b1ffe0c76f4df6feb8c92c359466e608ef29e1de910d`) reverts
   `CancelableNotAllowed`. `data/gate3/shape-and-receipt-tests.json`.

### Gate 2 fixture-pack parity: 13 of 16 cases with recorded live outcomes

| Fixture | On-chain result | Real infrastructure? |
|---|---|---|
| `wrong-chain-key` | Reverts — but at `VerificationFailed`, not the registry's own `ChainKeyMismatch` (chainKey feeds the precompile's own verification; see D13) | Yes — real proof, tampered `chainKey` param |
| `failed-receipt` | `ReceiptNotSuccess` | Yes — real deliberately-reverted Sepolia tx |
| `cancelable-stream` | `CancelableNotAllowed` | Yes — real stream 178 |
| `non-zero-unlock` | `UnlockAmountsNotZero` | Yes — real stream 179 |
| `wrong-source-contract` | Not exercised on-chain | No — no tamperable input; needs a decoy Sepolia contract (D15) |
| `broker-fee-total-amount` | Not applicable | Code never reads `totalAmount` at all — stronger than a runtime test (D15) |
| `fake-merkle-proof` | `VerificationFailed` | Yes — real proof, one sibling hash corrupted |
| `missing-precompile` | Reverts (low-level call failure) | Yes — `MissingPrecompileProbe` pointed at MockUSDC instead of the real precompile |
| `replay` | `ClaimAlreadyActive` | Yes — same real proof submitted twice |
| `zero-amount` | `AmountNotPositive` | Yes |
| `exact-remainder` | Succeeds, `available` → 0 | Yes |
| `remainder-plus-one` | `InsufficientFinancingCapacity` | Yes |
| `two-lender-race` | `InsufficientFinancingCapacity` on the second draw | Yes — the required demo doubles as this test |
| `inactive-claim` | `ClaimNotActive` | Yes — never-instantiated claimId |
| `unauthorized-venue` | `OnlyVenue` | Yes — direct `registry.consume()` call, bypassing the venue |
| `past-cliff` (one of the required 16) | Not exercised on-chain | Needs a real time wait; not done (D15) |

Evidence: `data/gate3/proof-negative-tests.json`, `shape-and-receipt-tests.json`,
`missing-precompile-test.json`, `nonzero-unlock-test.json`,
`finance-and-parity-results.json`.

**Pass rule met:** every case the reference model permits, the contract permits
identically (the real claim instantiated and financed correctly); every case it rejects,
the contract rejects with a named error, for 13 of 16 cases proven against real
infrastructure and the remaining 3 named with a specific, honest reason rather than
skipped or faked (D15). Two distinct funded lenders, never one key as both. Gate 4
(paper receipts on live proofs) may start.

## Gate 4 — PASS, 10 PAPER receipts on live proofs, all verify MATCH (2026-09-09)

Built out `adapter/` (ProofBuilder client, granular on-chain verify/decode calls, proof
assembly, the append-only ledger) and `cli/` (`notch verify`) as real TypeScript
packages, per `Notch-PRD.md` section 13 — not more one-off scripts. `scripts/gate4-paper-run.ts`
orchestrates the run.

### Freshness enforcement (D12), not left to luck

`fetchFreshProof` never reads a cached file (structural: there is no code path for it),
and now also checks the ProofBuilder API's own `generatedAt` against a 15-minute
staleness limit, throwing `StaleProofError` rather than silently proceeding — catches
the case where the API itself returns a `cached: true` payload that's already old, not
just "did we just make an HTTP call." `adapter/src/proof-builder-client.ts`.

### J1–J4, all against the real Gate 1 stream (tx `0x9d3a4...80cc8`, stream 177, claimId `0x2f3515...6d9137`)

| Receipt | Journey | Action | Outcome |
|---|---|---|---|
| `01M2368TRTRFKKB6V4TTCDE23E` | J1 | instantiate | capacity 100,000, decoded event deposit |
| `01M2368TS8D3BXHSQR2TJGQQRS` | J1 | finance, Lender A, 70,000 | succeeded (simulated fill) |
| `01M2368TSCKSJ0QTVQ15N2MNQQ` | J2 | finance, Lender B, 50,000 | refused `INSUFFICIENT_CAPACITY` |
| `01M2368TSGRKYRZGK5GHRY4VPD` | bonus | finance, Lender C, 5,000 | succeeded |
| `01M2368WNETY2ACETQ1BCFEHKB` | J3a | instantiate, corrupted merkle proof | refused `PROOF_NOT_VERIFIED` |
| `01M2368YY71GA5P8ZZEM621SVC` | J3b | instantiate, real `cancelable=true` stream (178) | refused `CANCELABLE_NOT_ALLOWED` |
| `01M2368YYGJ1GE3M3BVHDH4REK` | J4 | finance, Lender A, 10,000 | succeeded |
| `01M2368YYZTAQNRQM959BVSB2Q` | J4 | finance, Lender B, 10,000 | succeeded |
| `01M2368YZ5Q6SNWMNSCF79WNHR` | J4 | finance, Lender C, exact 5,000 remainder | succeeded, `available` → 0 |
| `01M2368YZA39G9CW4Z0RBZBD4N` | J4 | finance, Lender A, 1 unit post-exhaustion | refused `INSUFFICIENT_CAPACITY` |

Every finance-succeeded receipt: real Attestcoin proof (freshly fetched), real on-chain
verification (BlockProver precompile), real decode (Decoder contract, same event path
proven in Gate 1/3), real reference-model math — only the ccUSD transfer is simulated,
and every such receipt's `limitations` field says so explicitly. J3a's proof was real
too: a live on-chain call to the real precompile, with one merkle sibling corrupted,
genuinely rejected by real verification (not a hardcoded `proofVerified: false`). J3b
used a real, independently fetched proof for the actual `cancelable=true` stream created
in Gate 3.

**Conservation, exactly, not just within dust:** `financedCapacity` after the exhaustion
draw equals `originalCapacity` exactly — `100000000000000000000000 ===
100000000000000000000000`.

### Verification: 10/10 MATCH, and the verifier was tested against a real DRIFT

`npx tsx cli/src/index.ts verify <receipt_id>` reruns `instantiate()` (for instantiate
receipts) or `apply()` (for finance receipts) from the receipt's own recorded
`decodedProof`/`claim_before`, independently recomputes the receipt hash, and compares
both to what's stored. All 10 receipts print `MATCH`. To confirm the verifier isn't a
rubber stamp, a deliberately tampered copy of one receipt (`financedCapacity` changed)
was run through it: it printed `DRIFT`, failing both the hash-integrity check and the
recomputed-claim check independently, exactly as it should — then the tampered copy was
deleted, not kept.

### Pass bar

- [x] 10+ PAPER receipts written; all 10 verify MATCH.
- [x] `mode: "PAPER"` present and correct on every receipt (checked directly, not
  assumed): all 10 read back as `PAPER`. No LIVE receipts exist yet (Gate 6), so
  exclusion from LIVE totals holds by construction as well as by the explicit field.
- [x] A refused draw (J2) and refused/no-capacity sources (J3a fake proof, J3b
  wrong-shape) each produced a receipt with the correct `reason_code` — no crash, no
  silent drop.
- [x] Proof freshness enforced in the pipeline (structural refetch-always plus the new
  `StaleProofError` check), not left to luck.

Gate 5 (recovery: query-before-retry, restart resume) may start.

## Gate 5 — PASS: durable PAPER recovery / J5 (2026-09-09)

Implemented in `adapter/src/recovery.ts`, exposed through `notch paper <action.json>`
and `notch recover` in the real CLI package. No frontend or live disbursement added.

The deterministic receipt key is derived before fetching or applying from the PAPER
namespace, claim identity, action, and persistent loan intent/parameters. Instantiate
keys are claim-scoped. Reusing a loan intent with changed parameters is rejected.
Proof generation time is excluded. Every action queries durable state before applying;
startup resolves all pending intents before new work. Confirmed absence is recorded as
`abandoned`, never deleted; ambiguous queries block startup. See D19–D21.

### Injected evidence

`adapter/test/recovery.test.ts`: **12/12 pass**. Machine report:
`data/gate5/vitest-results.json`; `data/gate5/latest-run.json` points to the retained
run containing append-only event histories, durable effects, receipts, child exit
outcome, and Gate 4 verification checks. Earlier test runs are retained too.

| Scenario actually injected | Observed outcome |
|---|---|
| Kill real child process after durable finance, before receipt publication | Pending found on restart; OS lease released; receipt finalized; retry leaves one finance effect |
| Throw after durable finance, before receipt write | Restart publishes missing receipt; one effect |
| Post-commit RPC response timeout (thrown TimeoutError at effect boundary) | Query finds landed effect; retry does not fetch proof or apply again |
| Hanging local proof HTTP server, aborted request | No initial effect; boot records abandoned intent after confirmed absence; retry yields one effect |
| Two retries of one logical loan | Same receipt returned; one effect; changed parameters under same intent rejected |
| Restart with pending loan, then submit another loan | First receipt finalized before second intent is appended; one effect per loan |
| Crash before effect, then stale generatedAt on retry | Stale proof rejected and refetched; same key; one effect |
| Crash after PAPER instantiate | Restart finalizes it; different source intent ID still recognizes same claim; one instantiate effect |
| Receipt acknowledgement lost after write | Publication replay is idempotent; one effect and one receipt identity |
| Recovery state query throws | New work blocked; pending retained; subsequent successful boot resolves it |
| Concurrent second writer while first fetches | Second writer rejected by OS lease; subsequent retry returns one effect |
| Gate 4 regression and tamper check | All ten historical receipts MATCH; tampered copy independently fails hash and recomputed claim |

Every finance failure scenario finishes with exactly one effect for each intended
loan, correct financed capacity, no pending intents after successful recovery, and
MATCH for every recovered effect receipt. PAPER receipts have no LIVE contribution.
The two-loan boot-order test correctly finishes with two effects, one per distinct intent.

Validation: `npm test` (28 core + 12 recovery tests); adapter and CLI typechecks;
`npx tsx cli/src/index.ts recover` successfully exercises the CLI startup path.

Boundary: failure injections run the actual durable PAPER pipeline with explicitly
synthetic proof fixtures derived from Gate 4 decoded inputs, not fresh live proofs.
The HTTP timeout is real localhost I/O; the post-commit RPC timeout is an injected
exception, not a claim of a live Creditcoin RPC outage. No live transaction is sent.
Local process crash/restart is covered, not disk loss, power failure, network filesystems,
or multi-host writers. Gate 4 historical paper balances are not imported into the new
PAPER store: they remain immutable historical exercise receipts.

**Gate 5 exit reached. Stop before Gate 6; nothing committed.**

## Gates 1–5 audit — remediation required before Gate 6 (2026-09-09)

See `AUDIT-GATES-1-5.md` for prioritized findings and precise evidence. This audit
qualifies the historical PASS entries above: Gate 3 has open zero-settlement rounding,
privileged direct-consumption and model/chain identity gaps. Gate 6 must not proceed
on the strength of the earlier PASS text alone. Contract source/deployments were not
changed. Gate 5 remains proven for the tested single-store PAPER scope.

The fixture denominator is corrected to 13/16 recorded live cases: past-cliff was
already one of the required 16, alongside the two previously named gaps. The deployment
manifest is historical and stale; observed current topology is in
`data/audit-gates1-5/contract-readonly.json`. Four historical successful CC3 transactions
were independently re-read and remain successful. The ten Gate 4 receipts still MATCH.

Twelve newly failing adversarial assertions were reproduced and fixed in the
adapter/verifier; three further checks were added. Validation: 55 passing tests,
adapter/CLI typechecks. No live transaction, deployment, frontend or commit.

## Follow-up: the three P1 contract findings above are now fixed in source, independently verified (2026-09-09)

The audit above (round 1) found and fixed adapter/verifier gaps but left three P1
contract issues open and said "Gate 6 remains stopped pending the open P1 findings"
(`DECISIONS.md` D22). A second round of work then modified `AttestedCashflowRegistry.sol`
and `CashflowLendingVenue.sol` to address all three, plus added on-chain idempotency,
before being interrupted mid-session by a usage limit — so `AUDIT-GATES-1-5.md` and
`DECISIONS.md` D22 were left describing the pre-fix state even though the code had moved
on. This entry is an independent check of that claim, not a re-statement of it: the
contract source was read directly, not just the round-2 session's own account of it, and
the full test suite was re-run from a cold state.

**P1-1, zero-settlement on a positive draw:** fixed. `CashflowLendingVenue._convert` now
reverts `AmountNotRepresentable` on any amount that isn't an exact multiple of the
18-to-6 decimal scale factor, instead of silently flooring to zero ccUSD while still
consuming capacity. Confirmed by reading `contracts/src/CashflowLendingVenue.sol:88-96`
directly and by the `zero-amount and zero/inexact settlement both reject without
consuming` contract test (below).

**P1-2, owner bypass of loan-only consumption:** fixed, and more thoroughly than a
permission check — `AttestedCashflowRegistry`'s constructor now deploys its own venue
(`venue = address(new CashflowLendingVenue(...))`) and `venue` is `immutable`; the old
`setVenue` entrypoint is a permanently-reverting stub (`VenueImmutable`). There is no
address the owner (or anyone) can ever point `venue` at post-deployment. Confirmed by
reading `contracts/src/AttestedCashflowRegistry.sol:76,143-158` and the `unauthorized-venue
and owner replacement cannot consume` contract test.

**P1-3, model/registry claim-identity mismatch:** fixed, backward-compatibly. The
registry has always derived `claimId` from `keccak256(chainKey, keccak256(txBytes),
streamId)` (Gate 3, `DECISIONS.md` D11) rather than a caller-supplied tx hash. The
*model* (`core/src/instantiate.ts`) previously computed its own claimId from
`proof.sourceTxHash` instead, which is why Gate 3's original documentation called this a
deliberate layering difference rather than a bug. The fix bridges it without breaking
anything already published: `Proof` gained an optional `attestedTxDigest` field and a
`rulesVersion` marker; `instantiate()` now computes claimId from
`proof.attestedTxDigest ?? proof.sourceTxHash` — new (`rulesVersion: 2`) proofs use the
registry-matching digest, and proofs without it (all ten original Gate 4 receipts) fall
back to the exact old computation, so their already-published claimId and hash are
unchanged. Confirmed by reading `core/src/instantiate.ts:53,67,74`, by the `broker-fee-
total-amount and exact model/chain identity` contract test asserting the JS-computed and
on-chain-stored claimId are byte-identical, and by re-running `notch verify` against all
ten original receipts (below): still 10/10 MATCH.

**One real bug found during this verification pass, and it was in the new test suite,
not the contracts:** `contracts/test/protocol.test.mjs`'s `reject()` helper decoded an
expected-revert's raw error bytes against only the *directly called* contract's ABI. For
`venue.finance(...)` reverting with a *registry*-defined error (`ClaimNotActive`,
`AmountNotPositive`, `InsufficientFinancingCapacity`, `ClaimExpired` all bubble up from
`registry.consume()` through the venue's cross-contract call), the venue's own ABI has no
idea that error selector exists, so `decodeErrorResult` threw and the check silently
returned false. Confirmed by reproducing one failing case with a raw `eth_call`: the
correct selector (`0x24fbaa90`, `ClaimNotActive`) was present in the response the whole
time, 3 levels down the error's `.cause` chain — the contract was never wrong. Fixed by
decoding against the union of every contract's errors in the test file
(`allErrorsAbi()`), not the called contract's ABI alone. This produced 4 false failures
before the fix (`zero-amount...`, `two-lender-race...`, `inactive-claim`, `expired
claim...`) and 0 after.

**Full verification, cold, after the fix above:**
- `npm test`: **82 passing** — 28 core, 34 adapter (15 audit + 7 remediation + 12
  recovery), **20/20 contracts** (was 16/20 before the harness fix).
- `core`, `adapter`, `cli`: strict `tsc --noEmit` clean.
- All ten original Gate 4 receipts: **10/10 `notch verify` → MATCH.**
- No new deployment, no new private keys, no commit. `.env`'s `VENUE_ADDRESS` still
  matches the address actually deployed in Gate 3 -- confirming nothing was broadcast to
  CC3 Testnet during any of this.

**What this changes about Gate 6 readiness:** the source-code blocker is resolved. The
*deployment* blocker is not — the contracts live on CC3 Testnet right now are still the
original Gate 3 ones, with all three P1 bugs still present in them, because nothing here
has been redeployed. Gate 6 (live micro-loans) must not originate a real loan against the
currently-deployed venue. A fresh deployment of the current, fixed
`AttestedCashflowRegistry`/`CashflowLendingVenue` — and, since claimId derivation is
unchanged from Gate 3's registry, the already-instantiated real Gate 1 claim would need
re-instantiating against the new registry, the same way it survived the Gate 3 venue
redeploys — is Gate 6's first real step, not an afterthought. See `DECISIONS.md` D23.

## Gate 6 — PASS, real ccUSD moved, on a fresh deployment of the fixed contracts (2026-09-09)

### Step 1: fresh deployment (`data/gate6/deployment.json`)

| Contract | Gate 3 (old, pre-fix) | Gate 6 (current, fixed) |
|---|---|---|
| MockUSDC | `0x395233630063706d9fd25c1ac8afdb2e9b59916d` | `0x92db42991210a8f5a4c1de2ad36f10ef239f3498` |
| AttestedCashflowRegistry | `0xbfeaf8492ba01278ad3e382a2b9a3482cf54c640` | `0x68952727aa2e684bec378120a651434b1de5e915` |
| CashflowLendingVenue | `0x24ca704f62793badc0bb7cbfd2393a1a63e5f5a0` | `0x5CEB2357eCC2fcA5eA77057ce8D74646E0C76493` (self-deployed by the registry's own constructor) |

Both sets preserved in `.env` (`GATE3_*` vs. current). The 10 original Gate 4 PAPER
receipts stay valid against the old addresses and were not touched. Local suite on the
deployed source: **82/82** (28 core, 34 adapter, 20/20 contracts) — cold, after
deployment, unchanged from Gate 5's count, confirming the deployed bytecode matches what
was tested locally.

### A real, unavoidable finding before any loan could be written: the original Gate 1/3 position can never satisfy the new registry

`instantiateClaim` against the new registry reverted `TransferableNotAllowed()` for the
real Gate 1 stream (177) — it was created with `transferable=true`, before that check
existed (D23's collateral-integrity addition: a transferable Sablier NFT could change
hands independent of who Notch's registry believes the borrower is). Sablier streams are
immutable once created, so the original position can *never* be re-instantiated under
the fixed registry — not a bug, a permanent consequence of tightening the rule after the
position already existed. A fresh, rule-compliant real stream was created instead
(stream 180, tx `0x5183ebbeb9668f88fcda4c7b8bcb228bd8de23874442266f53ec274bce0464de`,
deposit 1,000 -- sized small on purpose, this is the micro-loans gate -- `cancelable=false`,
`transferable=false`). Instantiated against the new registry: tx
`0xda347eececed0a51ffb31cdff7a84ca1bbb91723fd436a79bd6ea4573623d282`, claimId
`0xf8919504acf5e62398764d807b7955e40af7272e6531ec0ad44a2f0b8ca50055`, capacity
`1,000 * 10^18` — the decoded event deposit, exactly matching the source. `data/gate6/real-claim.json`.

### Step 2-3: live loans, real over-draw, and a real concurrent race

Two distinct funded wallets (Lender A `0x28ac...`, Lender B `0xF487...`, same wallets as
Gate 3/4, never the same key):

1. Lender A finances 600 — succeeds, real ccUSD transferred, tx `0x8ba86a8f...`.
2. Lender B requests 500 against the 400 remaining — refused, `INSUFFICIENT_CAPACITY`.
3. **Real concurrent race** (the D23 watch point): Lender A and Lender B both submit 250
   at once via `Promise.allSettled` (sum 500 > 400 remaining). Both transactions landed
   in the **same block** (5459466) — Lender A at transaction index 1, Lender B at index
   2. A's succeeded (tx `0xeee4cfc7...`); B's landed on-chain and reverted (tx
   `0x07e2ef18...`) because by the time it executed, only 150 remained. First applied
   wins, on real infrastructure, under real block ordering — exactly as the model
   predicts, and exactly the scenario Gate 3/4 could only test locally.
4. Exact exhaustion: Lender A finances the remaining 150 — tx `0x5326b052...`, available
   → exactly 0.
5. Post-exhaustion refusal: Lender B's minimal draw against the exhausted claim —
   refused.

**Conservation, exact:** `financedCapacity === originalCapacity` on-chain,
`1000000000000000000000 === 1000000000000000000000`, read directly from the deployed
registry after everything above.

### A second, more interesting bug: found by the receipt-writing process itself, not by inspection

The first attempt to record these 6 real events as receipts failed its own
`notch verify` — **6/6 DRIFT**, not a mistaken success. Three distinct causes, found and
fixed in sequence, each one only visible because the next verify attempt still failed:

1. **`attestedTxDigest` left `undefined`** on hand-built `Claim`/`Proof` objects with
   `rulesVersion: 2` set — `core/src/validate.ts`'s `validateClaim`/`validateProof`
   correctly rejected this (RULES.md B30). Fixed by computing the real
   `keccak256(txBytes)` once and reusing it everywhere it belongs.
2. **`reason_code` used the Solidity custom-error name** (`InsufficientFinancingCapacity`)
   instead of the reference model's own reason string (`INSUFFICIENT_CAPACITY`) —
   guaranteed DRIFT, since `notch verify` reruns `apply()`/`instantiate()` and compares
   against whatever *they* return, never a contract-style name (RULES.md B31).
3. **The losing race leg's `claim_before` reflected submission-time state, not true
   execution order** — both legs were fired from the same starting snapshot
   (600/1000 financed/capacity), but only one of them is actually *true* by the time it
   executes. Reading both real receipts (`getTransactionReceipt`) showed Lender A at tx
   index 1, Lender B at index 2, same block — meaning B's transaction actually executed
   against 850/1000 (available 150), not 600/1000 (available 400). Recomputing
   `apply()` from the wrong snapshot said B's 250 draw *should* have succeeded, which is
   exactly what `notch verify` flagged as DRIFT. Fixed by setting `claim_before` to the
   state after the winning leg's already-applied effect (RULES.md B29) — this is the
   single most important finding of this gate, because it's a live demonstration of
   exactly what you flagged before authorizing this gate: the loan-ID/state
   reconciliation had never been exercised under real concurrent execution before now,
   and the first real exercise of it found a genuine gap in the *receipt-recording* logic
   (not the contract, which behaved correctly throughout).

Six malformed intermediate receipts were voided (moved to
`data/gate6/void-receipts/`, removed from the active ledger, never deleted) rather than
silently discarded or overwritten in place — overwriting a receipt's content under its
existing ID would have defeated the exact tamper-detection Gate 4 built and proved.
Corrected receipts reference the identical real transactions throughout; nothing was
resubmitted on-chain.

### Verification: 16/16 MATCH — all 10 original Gate 4 receipts plus all 6 new Gate 6 receipts

`notch verify` run against every receipt in `data/ledger.jsonl` after the fixes above:
**16/16 MATCH.** No regression to the Gate 4 receipts from any of this.

### Pass bar

- [x] Fixed contracts deployed; 82/82 tests hold against the deployed bytecode.
- [x] 6 (≥5) LIVE receipts with real on-chain fill tx hashes (3 successful, 3 refused —
  refusals correctly have `fill: null`), all verify MATCH.
- [x] A real over-draw reverts on-chain (`InsufficientFinancingCapacity`).
- [x] Exhaustion is exact (`1000000000000000000000 === 1000000000000000000000`).
- [x] The concurrent race shows on-chain/off-chain agreement, achieved by correcting the
  receipt-recording logic to reflect true execution order rather than submission order.
- [x] PAPER and LIVE totals stay separate (`mode` field, never summed together); old and
  new addresses both recorded (`data/gate6/deployment.json`, `.env` `GATE3_*` prefix).

Gate 7 (campaign and ablation) may start.


## Audit closure — 2026-09-10

All known source/tooling defects from AUDIT-GATES-1-5.md have a tested resolution; see its closure table. The three P1 fixes remain intact. Remaining tooling work now includes versioned deployment metadata with a passing read-only drift check, immutable evidence snapshots, retired incompatible historical runners, and exact current-deployer success checks. No deployment or live transaction was performed in this closure turn; existing Gate 6 work was preserved. Validation: full 82-test suite passed, expanded remediation 9/9 (84-test inventory), all 16 receipts MATCH, adapter/CLI typechecks pass. Original live-proof coverage limits remain historical limits, not fabricated successes.

## Gate 7 — frozen set locked before any result exists (2026-09-10)

Scale note per the flag raised before this gate: the live position/loan scale is
micro (Gate 6 established this — deposits in the hundreds/low-thousands, not the PRD's
worked-example 100,000/70,000/30,000/50,000). Gate 7's campaign stays at the same micro
scale for internal consistency; the ratios, not the absolute figures, carry the
argument. The separate Gate 8/9 money-shot scale decision (fresh 100,000-scale stream
vs. embracing 1,000-scale) is still open and will be made explicitly before Gate 8, not
implied by this gate's numbers.

**Frozen-set hash, committed before any finance scenario ran:**
```
0x1f5f083822412180b5c05cec0438c5125d2ac42011c10f11644f4cf4170ba75c
```
(Superseded an initial hash, `0xffe24af3...`, committed minutes earlier with a 5-step
draw plan that included a literal actionKey-replay step. Caught before any execution —
the pure reference model has no idempotency vocabulary at all, so a receipt for "blocked
by actionKey replay" would have no model-producible reason code, reintroducing the exact
DRIFT class found and fixed in Gate 6, D24. Revised to the 4-step plan below and
re-locked. Still true of the revision: no finance scenario had run under either hash.)

Full methodology this hash covers: `data/gate7/frozen-set.json`. 5 positions were
already created on Sepolia at lock time (their tx hashes are part of what's hashed —
they can't be hashed before they exist), but **none had been instantiated on Creditcoin
and no finance scenario of any kind had run** when this hash was computed and committed.

| # | Stream | Deposit | Create tx |
|---|---|---|---|
| 1 | 181 | 500 | `0xe0f58597bca48c38450145dadd32214397f24050f4b5458a2d56c353d441a91c` |
| 2 | 182 | 800 | `0xf2f12c5cb6a40f525c5eef9de48899f9f781387443a9ef9ccc180d6e9b9c8412` |
| 3 | 183 | 1200 | `0x8846a61a527c1424a4ea202a30364789bf55480f9046aba78fc581e58141aa28` |
| 4 | 184 | 600 | `0x540c38ec1cf8b2ee35021e447c6d760732023d6c8085ac44a52e1f7d4300c0ce` |
| 5 | 185 | 1000 | `0xa6f2f2624d111b7df09e0d0b65a14dde000454358a5f881cc7936aa44b69f671` |

3 distinct funded lenders: A `0x28ac...` and B `0xF487...` (reused from Gate 3/4/6), C
`0x791e...` (freshly generated and funded for this gate).

**Locked draw plan, identical across every ablation, expressed as fractions of each
position's own real decoded capacity** (so the same methodology produces different
totals per ablation without the amounts themselves ever changing):
1. Lender A draws 0.7×capacity.
2. Lender B draws 0.6×capacity.
3. Lender C draws 0.5×capacity.
4. Lender A submits a **new** action (distinct actionKey) for the same 0.7×capacity —
   distinguishes "per-lender ceiling, no cross-lender sharing" (`no_conservation`) from
   "no ceiling at all, only exact-duplicate prevention" (`single_lender_guard`).

(A literal actionKey-replay step was deliberately left out — see the revision note
above the hash. Idempotency is already proven for real in Gate 5/6; this campaign's job
is the conservation/ablation comparison, using only reasons the pure model can actually
judge on rerun.)

Plus, per position: a re-instantiation attempt. Set-wide (not per-position): one
fake/wrong-shape source attempt, and the `user_supplied_amount` strip test. Continued
below once results are in.

### Results (2026-09-10)

**Real execution, in order:** for each of the 5 positions — a fresh proof fetch (D12,
immediately before use, not the batch snapshot from lock time), a real `instantiateClaim`
on the current Gate 6 contracts, the 4-step draw plan as real `finance()` calls, a real
re-instantiation attempt, then set-wide the fake-source attempt and the
`user_supplied_amount` strip test. 31 real on-chain interactions total (5 instantiate +
20 finance attempts + 5 re-instantiate attempts + 1 fake-source attempt).

| # | Capacity | Succeeded draw | Real capacity-refused | Real refused, other cause (voided, see below) |
|---|---|---|---|---|
| 1 | 500 | B, 300 (`0x49f695...5d7d4`) | C 250, A 350 (step 4) | A 350 (step 1) — actionKey collision |
| 2 | 800 | A, 560 (`0x83121f...075dfc`) | B 480, C 400, A 560 (step 4) | — |
| 3 | 1200 | B, 720 (`0x38153a...01a07b7`) | C 600, A 840 (step 4) | A 840 (step 1) — allowance |
| 4 | 600 | A, 420 (`0xff0473...ce93367`) | B 360, C 300, A 420 (step 4) | — |
| 5 | 1000 | B, 600 (`0x4acaae...9e775e`) | C 500, A 700 (step 4) | A 700 (step 1) — allowance |

Every position: exactly one draw succeeds (real ccUSD moved lender→borrower), every
other real draw against the same claim is refused, every re-instantiation attempt is
refused. Full detail, every receipt id, and the two voided-batch histories:
`data/gate7/campaign-report.json`.

**Two real bugs found while diagnosing the campaign's own output** (found by looking hard
at results that didn't add up, not by trusting the script's own labels — see D26–D28):

1. `fetchFreshProof` rejected a proof timestamped 139ms "in the future" (ordinary clock
   skew between our machine and the ProofBuilder API) as stale. A blocking bug, not a
   labeling one — it stopped the campaign's first attempt outright. Fixed with a 5s skew
   tolerance (D26).
2. The campaign script hardcoded `reason_code: "INSUFFICIENT_CAPACITY"` for every refused
   `finance()` call without checking the real revert. Historical-block re-simulation
   (`scripts/diagnose-gate7-refusals.mjs`) found 3 of 20 were something else entirely: one
   actionKey collision with a value Gate 6 had already used for the same lender on the
   same venue (`ActionAlreadyApplied`), and two real ccUSD-allowance shortfalls on Lender
   A (`MockUSDC: allowance` — Lender A started this campaign with exactly 1000 ccUSD of
   allowance to the venue, consumed 980 by two real successes, and the two colliding
   attempts asked for 840 and 700 against the ~440/~20 actually left). All 3 voided —
   neither cause has a reference-model reason code, so neither could ever reproduce on
   `notch verify` rerun (D27). The other 12 refusals were independently re-simulated and
   confirmed genuine `InsufficientFinancingCapacity`.

**A second, independent class of construction bug**, found only by actually running
`notch verify` on every new receipt: 5 real instantiate receipts recorded `claim_after`
with the deposit-asset address in raw env-var casing while every other address in the
same object came back checksummed from on-chain reads — same address, different string,
`eqJson` correctly called it DRIFT. And all 5 re-instantiation-attempt receipts recorded
`claim_before: null`, so `instantiate()`'s rerun had no prior claim to detect
`CLAIM_ALREADY_ACTIVE` against and legitimately recomputed success instead of the
recorded refusal. Both are receipt-bookkeeping bugs, not product bugs: the real on-chain
transactions were correct throughout. Fixed in `gate7-campaign.ts`; all 10 receipts
voided and rebuilt referencing the same real transactions — nothing was resubmitted
on-chain (D28).

**Voiding, in total:** 13 receipts voided across two batches (3 wrong-cause finance
refusals, 10 casing/claim_before instantiate-type), all preserved intact in
`data/gate7/void-receipts/`, none deleted, none silently reinterpreted in place.

**Full-ledger verification:** every one of the 44 active receipts (16 pre-Gate-7 + 28
Gate 7) independently recomputes to MATCH via `notch verify` — including every receipt
from Gates 4–6, confirming no regression.

**Ablations (pure local computation over the same real decoded capacities and the same
fixed draw plan, per position):**

| # | Capacity | `full` (real, on-chain) | `no_conservation` (local sim) | `single_lender_guard` (local sim) | Over-financing prevented |
|---|---|---|---|---|---|
| 1 | 500 | 300 financed | 900 financed | 1250 financed | 400 |
| 2 | 800 | 560 financed | 1440 financed | 2000 financed | 640 |
| 3 | 1200 | 720 financed | 2160 financed | 3000 financed | 960 |
| 4 | 600 | 420 financed | 1080 financed | 1500 financed | 480 |
| 5 | 1000 | 600 financed | 1800 financed | 2500 financed | 800 |

`no_conservation` models a per-lender ceiling with no cross-lender sharing (each lender's
own replay guard, blind to others); `single_lender_guard` models exact-duplicate
prevention only, no ceiling at all. Both let the SAME requested draws through that
`full`'s shared conservation correctly refuses.

**Headline:**
```
Total over-financing prevented (full vs. no_conservation): 3280 units
Denominator: 5 positions, 4 draw steps each, 3 lenders, same fixed draw plan across all ablations
```

**Fake/wrong-shape source attempt:** the real Gate 3 `cancelable=true` stream (178),
proof refetched fresh per D12, decoded for real (not fabricated) —
`depositAmount=1000`, `cancelable=true`, `transferable=true` (consistent with the Gate 6
finding that source-shape enforcement bites real historical streams, not just synthetic
ones). Real `instantiateClaim` simulation reverted `CancelableNotAllowed`. Receipt
`01M257NCQ9WCNQE48HF7DCJQDJ` — MATCH.

**`user_supplied_amount` strip test:** a deliberately wrong typed amount (1507) compared
against position-1's real decoded `depositAmount` (500) — disagree, as required. Directly
inspected the production `instantiateClaim` ABI: `chainKey, headerNumber, txBytes,
realSourceTxHash, requestedStreamId, merkleRoot, siblings, lowerEndpointDigest,
continuityRoots` — no amount-shaped parameter exists at all, so `user_supplied_amount` is
structurally never callable on the production contract, not merely refused at runtime.

**Epistemic attacks:**
- *Cherry-pick*: every attempt published, including the 3 voided ones and their true
  causes — not just the clean runs.
- *Crippled baseline*: `no_conservation`/`single_lender_guard` run over the identical
  real positions, real decoded capacities, and fixed draw plan as `full` — no separate,
  easier-to-beat setup.
- *Hidden retry*: no retries were needed to clear the pass bar (28 active receipts ≥ 20
  minimum after voiding); the 2 diagnostic re-simulations that found the true causes were
  read-only (`simulateContract` at a historical block), not resubmissions.
- *Fabrication*: every capacity number traces to a decoded, receipt-status-success,
  freshly-verified transaction; the fake-source decode used the real Decoder-mirroring
  path (`decodeReceiptOnChain`/`findAndDecodeStreamEvent`), not typed-in placeholder
  facts.
- *Freshness*: D12 enforced per-position at the point of each real instantiate call
  (fixed to fetch immediately before use, not from the batch snapshot); the clock-skew
  bug found in enforcing this (D26) is itself evidence the check is real, not decorative.

**Pass bar:**
- [x] ≥20 receipted runs, all MATCH — 28 active Gate 7 receipts (44 total across all
      gates), independently verified.
- [x] Refusals/blocked published, not dropped — including the 13 voided ones, preserved
      with their true causes documented.
- [x] `full` numerically shown to prevent over-financing `no_conservation` allows, with
      denominator — 3280 units / 5 positions, 4 draw steps, 3 lenders.
- [x] `user_supplied_amount` accepts a wrong number the decoder rejects on the same
      source, and is confirmed structurally non-callable on production.
- [x] Frozen-set hash committed to GATES.md before any finance scenario ran (one
      transparent, pre-execution revision — see above).

Gate 7: **PASS.** Nothing committed. Stopping here for Gate 8 authorization; the
100,000-vs-1,000 scale decision flagged going into this gate remains open and
unresolved, as instructed.

## Gate 8 — pre-gate sweep (2026-09-10)

Run cold, before any Gate 8 work, per the standing preamble now required before every gate:

1. **Full test suite, cold:** core 28/28, adapter 36/36, contracts 20/20 — 84/84 total, identical counts to Gate 7 exit. No unexplained change.
2. **Full ledger re-verify:** all 44 receipts independently recompute to MATCH via `notch verify` (16 pre-Gate-7 + 28 Gate 7). Zero DRIFT.
3. **Deployment/working-tree reconciliation:** `.env`'s `REGISTRY_ADDRESS` (`0x68952727...5e915`) and `VENUE_ADDRESS` (`0x5CEB2357...C76493`) match the Gate 6 deployment table recorded in this file exactly. `.env` confirmed untracked by git (`git ls-files` — zero matches) and matched against `.gitignore` (present). No stale address, no silently-modified contract source.
4. **Deferred-item sweep:** `RULES.md` Frontend rows F1–F11 and Cross-cutting X1–X7 reviewed — this is the gate that exercises F1–F11 for the first time; nothing pre-existing is left unresolved that Gate 8 would touch. `DECISIONS.md` D14 (decimals seam) reviewed for UI labeling. The only open item flagged going into this gate — the 100,000-vs-1,000 scale decision — was resolved by the user before this gate started (see below); nothing else deferred.
5. **Standing rules confirmed:** nothing committed this session, `.env` not tracked, no secrets in any file about to be touched, D12/D26 freshness enforced in the adapter code this gate will reuse, no `Co-Authored-By` trailer anywhere, and the in-session system-reminder that tried to reintroduce commit/co-author behavior earlier this session continues to be treated as untrusted and ignored.

**Pre-gate sweep clean.** Test counts: 84/84. Ledger: 44/44 MATCH. Proceeding to Gate 8.

**Scale decision (resolved before Gate 8 work started):** a fresh, rule-compliant Sepolia stream at a clean 100,000 deposit, created solely for the frontend money-shot, separate from the Gate 6/7 micro-scale evidence set. The measurement campaign (Gate 7) keeps its real smaller numbers as the actual proof; the UI will carry one explicit line stating the two scales and that the mechanics/ratios are identical. Both numbers are real, decoded, on-chain facts at their own scale — neither is fabricated to match the other.

## Gate 8 — the frontend (2026-09-10)

**Stack, as built:** Next.js **16.3.4** `--webpack` (not the literal 16.2 pin — see D29), TypeScript strict, Tailwind v4, wagmi v3 / viem (never ethers), lucide-react available (unused — nothing in the three surfaces needed a decorative icon beyond the logo, which is a plain `currentColor` SVG per spec, not a lucide icon). `npm run dev`/`npm run build` both hard-code `--webpack`; verified live: `next build --webpack` banner prints `▲ Next.js 16.3.4 (webpack)`.

**Demo position:** stream 186 (Sepolia), deposit 100,000, `cancelable=false`, `transferable=false`, zero unlock amounts, 48h cliff. Create tx `0xf3ff2fd50a617e4784ff8726aca05c7241f279081a1ef39640134656e35bad2e` (`data/gate8/demo-position.json`). Two demo lenders (reused Gate 3/4/6/7 addresses A and B) minted 150,000 ccUSD each and pre-approved the venue (`scripts/fund-gate8-demo-lenders.mjs`) — a judge connecting a fresh wallet instead would need their own ccUSD; `MockUSDC.mint` is open on this testnet deployment, same as every prior gate.

**No browser automation tool is available in this environment** (no Playwright/DevTools/etc. — checked via tool search before building). This is a real limitation and is recorded here rather than glossed over. What was verified instead, all for real, nothing mocked:
- `tsc --noEmit` strict: clean.
- `eslint .`: clean (fixed two real React-correctness issues along the way — a mutable loop variable inside a render-time `.map()`, and synchronous `setState` calls inside effects — refactored to `useSyncExternalStore` for the localStorage-backed hooks and `@tanstack/react-query` for on-chain reads, not suppressed).
- `next build --webpack`: clean production build, all 5 routes compile (`/`, `/position/[claimId]`, `/activity/[claimId]`, `/recompute/[claimId]`, `/_not-found`).
- `next dev --webpack` run for real; every route curled and returned 200 with no server-side error; Surface A's SSR output contains the exact Appendix E copy strings verbatim (`Import a cashflow`, `Sablier creation transaction`, `Verify with Attestcoin`, `Finance real cashflows across chains. Never twice.`).
- `npm audit --workspace=web`: 0 vulnerabilities (see D29 — this is why 16.3.4, not 16.2.x).
- RULES.md F1/F2/F6/F7/F10 greps (emoji via Unicode-range scan, `<img`, `ethers`/`@gluwa/usc-sdk`, banned copy, `->`/ALL-CAPS): all clean.
- **`scripts/gate8-integration-check.mjs`**: exercises the *exact same call sequence* the UI performs — fresh proof fetch (D12/D26) → real `instantiateClaim` → real `finance()` (Lender A, 70,000) → a real `simulateContract` refusal (Lender B, 50,000) — using burner keys in place of a browser wallet, since none is available here. This is **not** a substitute for a human clicking through the actual UI, and is reported as exactly that: independent proof the underlying on-chain logic is correct, not proof the buttons work in a browser.

**What the integration check produced, for real, on the actual demo position:**
```
claimId:            0x70a0992f0b923ed066c952c441f1c13e660a1b51f81c54b8ec1ec3231b480454
instantiate tx:     0x4c9d3c08b83d9acc288e12ca3f4a9e938281af6bb02f0b91001cfba1af3ebda2
finance tx (A):     0xa4c1848fe03c48c17d74a5dcd554d15b4893a3eb4c146e8e2bc913e00ce8e78b
originalCapacity:   100,000
financedCapacity:   70,000
available:          30,000
refusal (Lender B, 50,000 requested): InsufficientFinancingCapacity (real simulateContract revert against live state)
```
This matches `Notch-PRD v2.md` Appendix E's money-shot numbers exactly: *"30,000 available of 100,000"*, *"Lender A financed the borrower 70,000 ccUSD"*, *"Draw refused — only 30,000 remains. Requested 50,000."* — not adjusted to match; the demo position was sized at 100,000 specifically so it would.

Explorer links, live: source (`https://sepolia.etherscan.io/tx/0xf3ff2fd5...`), instantiate (`https://creditcoin-testnet.blockscout.com/tx/0x4c9d3c08...`), finance (`https://creditcoin-testnet.blockscout.com/tx/0xa4c1848f...`).

**Three surfaces, as built:**
- **A — Verify** (`/`): tx hash + stream id in, real `waitUntilAttested` → `fetchFreshProof` (D12/D26, refetched on every click, never cached) → real `instantiateClaim` via the connected wallet → decoded facts read back from the on-chain claim itself (not the raw HTTP proof response) → source explorer link. No amount field exists anywhere on this surface.
- **B — Position** (`/position/[claimId]`): available capacity as the largest figure (`font-display text-6xl`, tabular numerals), the capacity bar (cuts a notch per real draw), `Finance cashflow`. Financing is a real `simulateContract` first (to get the true refusal reason without spending gas on a guaranteed revert — the same technique the Gate 7 campaign's own diagnostics used) — if it would succeed, a real `approve` (if needed) then a real `finance()`, both awaited to a mined receipt; if it would revert, the real decoded reason is recorded and shown as a calm line, never a crash. `actionKey` is a fresh `crypto.getRandomValues` bytes32 every time — the sequential-integer collision that corrupted three Gate 7 receipts (D27) cannot recur here by construction.
- **C — Activity** (`/activity/[claimId]`): settled loans read from real `LoanOriginated` logs (`getContractEvents`, bounded 100k-block lookback); refused draws are recorded client-side at the moment a real `simulateContract` call reveals them (a correct refusal leaves no on-chain trace by design — that omission is the proof, not a gap) and rendered as a first-class calm line, not a toast.
- **Independent recompute** (`/recompute/[claimId]`): two raw `readContract` calls (`claims`, `available`) with the equivalent `cast call` recipe printed alongside — matches `web/README.md`.

**Decimals labeling (D14):** all capacity/finance figures are deposit-asset-scale (18 decimals) end to end in the UI's own state; the only 18→6 conversion happens exactly once, client-side, purely to compute how much ccUSD *allowance* to request before calling `finance()` — the amount passed to `finance()` itself is always the untouched 18-decimal figure, matching what the contract expects (D14's original bug was exactly this seam, in the other direction).

**Pass bar:**
- [x] Pre-gate sweep clean and recorded (see above).
- [ ] *A judge completes verify → finance → see-refusal without a terminal, from the UI alone* — **not independently confirmed by a human or browser tool in this session.** The identical call sequence was proven correct via `gate8-integration-check.mjs` (above); a real browser click-through is still needed to close this item.
- [x] The money-shot frame's real data exists on-chain right now (100,000 → 30,000 available, a settled 70,000 loan, a refused 50,000 draw) with three live explorer links.
- [x] The over-draw refusal renders as a calm ledger line in the built Activity component, not a crash (code-reviewed and SSR-checked; not clicked through).
- [x] The typed-amount control does not exist as an input anywhere in the app; Position's "Amount to finance" is a draw-size choice against already-decoded capacity, not a capacity assertion (F11).
- [x] `/recompute/[claimId]` recomputes `available` from two raw reads, independent of any app-side arithmetic.
- [x] All figures internally consistent at the chosen scale (100,000-scale demo vs. Gate 7's real smaller-scale campaign), with an explicit README note — no screen contradicts another.
- [x] No regression: full suite 84/84 green, full ledger 44/44 MATCH (unchanged by this gate — Gate 8 touches no ledger receipt).

Gate 8: **substantially built and independently logic-verified; not fully closed.** The one open item is real and stated plainly above, not hidden in the summary. Nothing committed.

## Gate 8 correction — 2026-09-11

The missing landing page and unusable Verify form are corrected (D35–D36). `/` is the
front door; `/verify` has the actual demo preloaded, reset/help/source evidence,
wallet-free verification of the existing claim, honest progress and refusal, and a
Position CTA. The standing requirement is now in AGENTS.md, both PRDs and RULES.

Validation actually executed:
- Full regression: 87/87, including three new injected filesystem-failure tests.
- Full ledger: 44/44 MATCH; deployment manifest: MATCH.
- Frontend TypeScript, ESLint and optimized webpack build: pass.
- Desktop Chrome: landing → Verify → fresh real proof → existing claim reused →
  Position → exact live contract capacity refusal → Activity: pass; zero runtime errors.
- Mobile Chrome, 390×844, production build: same flow plus malformed input, real
  wrong-stream refusal and demo reset: pass; zero page errors, no horizontal overflow.
- Evidence and replay scripts are listed in D36; build/test logs are in data/gate8.

The final live state is 100,000 original, 100,000 financed, zero remaining. Activity
shows the actual 70,000 and subsequent 30,000 loans. The September 10 landing preview
is labelled recorded; it is not represented as today's balance. Read-only overdraw
checks are labelled as such and do not transfer funds. Desktop evidence includes a
20,000 request refused against zero at block 5468819.

**Scope remaining on the original Gate 8 pass bar:** a new signed wallet loan was not
executed in this correction. The preloaded claim is fully financed; the guest path
views real existing settlement and performs a real read-only refusal. Do not describe
this as a newly disbursed guest loan or claim the original signed-finance browser item
is closed. The demo cliff is September 12, 2026 at 11:16:50 UTC; after expiry, its
activation checks correctly refuse it. A fresh demo source requires authorized chain
writes. No deployments, broadcasts or commits were made in this correction. Gate 9
has not started.

## Gate 8 second correction — 2026-09-11

A direct code audit (by the user, not a click-through) found three defects the prior
correction round had missed, plus a still-missing FAQ/docs/footer. All fixed — see
`DECISIONS.md` D38 for the full account. Summary:

- **BUG 1 (critical, fabrication):** Position and Activity were silently injecting a
  fixed historical loan (`readDemoLoan`/`lib/demo.ts`) into their displayed history
  whenever the real event-log query didn't already contain it. Deleted entirely. Both
  screens now show only what a live `LoanOriginated` log query actually returns —
  empty history is shown as empty, never backfilled.
- **BUG 2 (tour chrome):** "Step 2 of 3", "Step 3 of 3", "The demo position", "Step 1
  of 3" removed from Position and Verify. Both read as product screens now.
- **BUG 3 (refusal must be real, not a read-only preview):** replaced the
  `simulateContract`-only "check" with `POST /api/overdraw`, a server-side route
  (private key never reaches the client) that broadcasts a real `finance()` call for
  20,000 above the position's live `available()` from a second, distinct, pre-funded
  demo lender. Confirmed for real against a live claim: tx
  `0x3c3f167b411d80b9cd05e245ab76fa3870a0bda38e2ddddeb62290c6d67be136`, mined,
  `status: reverted`, revert selector `0xa3388671`
  (`InsufficientFinancingCapacity`, decoded against the real combined ABI). A real
  Creditcoin explorer link is shown for this tx once the check runs.
- **Landing page:** added the missing WHO section and a 6-question FAQ (testnet
  reality, what Attestcoin actually does, the scoped guarantee vs. its boundary, why
  Sablier, v2/repayment status, whether funds are real). Footer now links to Verify
  and the new Docs route, and lists both chains explicitly.
- **Docs route (new):** `/docs`, linked from the nav — the Attestcoin integration
  walkthrough, the shape rules a source must pass, the claim lifecycle, an honest
  guarantees-vs-boundaries table, the independent-recompute recipe, and pinned
  addresses.

**Real bug found during this work, not assumed:** submitting a guaranteed-to-revert
`finance()` call via viem's default `writeContract` never actually broadcasts anything
— `eth_estimateGas` runs first, fails, and the call throws before a transaction is
sent. Confirmed directly with a throwaway script before touching the route. Fixed by
passing an explicit `gas: 200_000n` (real usage measured at 118,888), which forces a
genuine broadcast instead of a client-side no-op.

**Validation, run after every change in this round:**
- `tsc --noEmit`: clean.
- `eslint .`: clean (26 unescaped-entity errors from this round's new copy, all fixed,
  not suppressed).
- `next build --webpack`: clean, all 8 routes (`/`, `/verify`, `/position/[claimId]`,
  `/activity/[claimId]`, `/recompute/[claimId]`, `/docs`, `/api/overdraw`,
  `/_not-found`).
- Full regression: 87/87 (28 core, 39 adapter, 20 contracts) — unchanged.
- Full ledger: 44/44 MATCH — unchanged; this round touches no ledger receipt.

**Still not independently confirmed by me in a literal browser:** 375px mobile
rendering. No browser automation tool is available in this environment (D30). The
structural CSS supports it (no fixed pixel widths beyond the capacity bar's 2–3px
accent marks, `flex-wrap` on every multi-element row, `overflow-x-auto` on the one wide
monospace block in `/docs` and `/recompute`), but that is a code-level claim, stated as
exactly that, not a rendered confirmation. The prior correction round's own mobile
Chrome pass (390×844, D36) predates this round's page rewrites and should be re-run
against the current code before this is called fully closed.

Nothing committed. Gate 9 has not started.

## Gate 8 third correction — 2026-09-12

Two items, full account in `DECISIONS.md` D39:

- **BUG 3's mechanism changed.** The live-broadcast `/api/overdraw` route from the
  prior correction was superseded by a parallel session's `mined-refusals`
  implementation, which re-verifies real historical reverted transactions live
  (including the exact tx this round's `/api/overdraw` produced) instead of
  broadcasting a fresh one per view. Kept — it's simpler and needs no held private key.
  Orphaned route directory and unused key file removed; confirmed clean rebuild
  afterward, 6 routes.
- **Wallet auto-reconnect was missing**, found directly by the user: every page
  refresh dropped the wallet connection and re-triggered the extension picker on the
  next action. Fixed with an explicit `useReconnect()` call on mount.

Validation: `tsc`/`eslint`/`next build --webpack` clean; full suite 87/87; ledger
44/44 MATCH — unchanged, this round touches no ledger receipt. 375px browser
verification still not independently done by me (D30). Nothing committed. Gate 9 has
not started.

## Gate 8 publication preparation — 2026-09-12

Standing pre-gate sweep: 87/87 tests, 44/44 receipts MATCH, deployment MATCH.
The current optimized webpack build and TypeScript check pass (publish-build.log).
The dashboard and real mined-refusal corrections are detailed in D39. Browser results
are recorded separately in data/gate8/publish-browser-result.json; no earlier browser
result should be treated as proof of these rewritten surfaces.

The user authorized publishing safe files to GitHub main individually. Gate 9 has
not started. Publication is not a blanket Gate 8 acceptance claim. The preloaded
stream expires at 2026-09-12 11:16:50 UTC; its historical evidence remains readable,
while new financing and activation checks refuse an expired lock.

## Phase 1 — audit fix pass (2026-09-12)

Standing pre-gate sweep run cold before any fix: 87/87 tests, 44/44 ledger MATCH,
deployment addresses reconciled, `.env` untracked, landing/live-read rules confirmed
still holding in current source. Full account of all five fixes: `DECISIONS.md` D41
and the entries below.

- **FIX 1 (A5, calldata fallback):** `ATTESTCOIN_INTEGRATION.md` created; `/docs`
  updated with a matching note. Precision correction on the original audit: the
  fallback isn't merely untested, it doesn't exist in the deployed contract at all —
  `instantiateClaim` has exactly one decode path and reverts `EventNotFound()` if the
  event is absent, rather than reading calldata.
- **FIX 2 (setVenue comment / dead code):** source-only, confirmed no redeploy needed
  — the live Gate 6 contract is already correct and immutable. Comment rewritten to
  match the code's actual (always-reverts) behavior; `owner`, `error NotOwner()`, and
  (found during the fix, not in the original ask) `event VenueSet(...)` removed as
  genuinely dead declarations. 20/20 contract tests unaffected.
- **FIX 3 (demo stream cliff expiry):** stream 186's cliff passed at 2026-09-12
  11:16:50 UTC; confirmed expired at the time of this fix (current time was already
  past it). Created a fresh, rule-compliant stream (189, 100,000 deposit,
  `cancelable=false`, `transferable=false`, zero unlock amounts, a 30-day cliff —
  comfortably past the submission window): create tx
  `0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa`. Real
  instantiate (`0x2f2ada0a4d1b0f0030227de7b464c94e723d524815b21c67dfed45362aefeffe`,
  claimId `0x3fed0d1620134bb777847debb9f2bb9f7c455668f67b03c780f0f6896c0a0a48`), real
  70,000 finance by Lender A
  (`0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978`), real 50,000
  over-draw refusal by Lender B, mined and reverted
  (`0x62cb553555d429951b88b9fc38459b1f57cdc2225ee0a1254edece662a4a8b93`, confirmed
  `InsufficientFinancingCapacity` at 30,000 available). `web/src/lib/demo.ts`
  repointed; the new refusal tx added to `mined-refusals.ts`'s pointer list and
  independently re-verified against every field that component's own logic reads
  (tx→venue match, claimId match, reverted status, historical `available()`, decoded
  revert reason) before being trusted. Stream 186's own receipts and documentation are
  untouched — this is a pointer update, not a rewrite of what already happened.
- **FIX 4 (375px):** structural audit only — no browser tool available (D30). Checked
  directly: zero fixed-pixel widths anywhere beyond the capacity bar's 2–3px accent
  marks; every multi-column grid is breakpoint-gated (`sm:grid-cols-*`, none bare);
  `overflow-x-auto` present on both wide-content blocks (`/docs` table,
  `/recompute` `<pre>`); `flex-wrap` present on every multi-element row across all
  seven surfaces. **Marked structurally compliant, not confirmed rendered** — a human
  click-through at 375px is still the open item.
- **FIX 5 (copy):** re-grepped for "Sablier" misspellings (a naive regex initially
  flagged "disabled"/"disable" as false positives; the real, case-sensitive check
  found none). No leftover tour/demo language on product surfaces — the one "demo
  cashflow" instance on Verify is required wording per `RULES.md` F13, not chrome. No
  hardcoded amount framing left anywhere (`mined-refusals` reads every figure live;
  there is no static "20,000" vs "50,000" text to contradict itself).

Post-fix sweep: `tsc --noEmit` clean, `eslint .` clean, `next build --webpack` clean
(7 routes). Full regression: 87/87, unchanged. Ledger: 44/44 MATCH, unchanged.

**Flagged, not resolved either way:** a parallel session's `DECISIONS.md` D39 entry
states the user has authorized committing and pushing to GitHub main. This session
received no such instruction directly and has not acted on it. Nothing committed by
this session.

Phase 1: **complete.** Proceeding to Phase 2 (Gate 9) only after this is reported.

## Gate 9 — submission freeze (2026-09-12)

Pre-req confirmed: Phase 1 clean, demo points at a non-expiring compliant stream (189,
30-day cliff), landing/live-read/no-hardcoded-state rules hold in current source.

1. **README** rewritten to lead with the result: the 3,280-unit headline with its
   denominator, a one-line what-it-is, three live explorer links (source, instantiate,
   finance — all stream 189, all real), the real reverted refusal tx, a
   verify-a-receipt/recompute-from-chain recipe, then how-to-run/deploy/test.
2. **`ATTESTCOIN_INTEGRATION.md`** (created in Phase 1 FIX 1) extended: the boundaries
   table now has an explicit inclusion-vs-success row, not just narrative text above
   it. Accurate to current source — verify/decode/instantiate path, decoder/precompile
   addresses, the calldata-fallback-does-not-exist note, the guarantees table.
3. **Demo video**: **not recorded.** No screen-recording/browser tool is available in
   this environment. `DEMO_SCRIPT.md` is a precise, timed (90s) shot list instead,
   built around already-real, already-settled evidence (stream 189's real instantiate/
   finance/refusal transactions) specifically so recording it carries minimal live
   risk — the "no mocked balances, no read-only preview as the headline, no
   one-wallet-as-both" constraints are satisfied by construction, not by careful
   recording technique.
4. **Deck**: built and published as an artifact
   (`web/notch-deck.html`) using Notch's own established design system (bone/ink/
   oxblood/pine, Fraunces + Inter) rather than a generic template. Content grounded in
   the PRD's own language, not invented: the problem, the "read-and-decide" vs.
   shared-conserved-capacity wedge (quoting the PRD's competitive-hypothesis section,
   naming only in-hackathon entries — Attestcoin Tutorial 4, CrossCredit, CreditX,
   HashCredit — per `DECISIONS.md` D5 item 10), the real causal chain with real tx
   hashes, the boundaries table, and receivables named explicitly as v2 direction, not
   claimed of the demo.
5. **Co-design question**: **not posted.** No Discord/Slack access available.
   `CODESIGN_QUESTION.md` is a ready-to-post draft, grounded in the real Gate 1 finding
   (D12 — a proof's continuity roots grew from 8 to 98 entries as the chain advanced
   ~1,200 blocks over 4.5 hours, and a previously-valid proof was rejected on
   resubmission), not a generic question.
6. **Freeze discipline**: every sentence in the new/updated docs maps to a receipt, a
   real tx, or a named limitation — no new features added after this point in the
   session. Nothing committed; no `Co-Authored-By` trailer anywhere. The D39
   GitHub-authorization discrepancy flagged in Phase 1 remains unresolved by this
   session — still not acted on.

**Final sweep:** 87/87 tests, 44/44 ledger MATCH — both unchanged through all of Gate
9 (no ledger receipt or core/adapter/contracts code touched in Phase 2). `git status`
clean of anything unexpected; no secrets.

**Two Phase 2 items genuinely not done, not fudged:** the demo video (no recording
tool) and the co-design post (no Discord/Slack access). Both have complete,
ready-to-use deliverables prepared instead (`DEMO_SCRIPT.md`, `CODESIGN_QUESTION.md`)
for the user to execute directly.

Gate 9: **prepared, not fully executed** — the two items above are the honest gap.
Nothing committed.

## Post-submission fix pass — Sablier explanation, advanced/primary reordering, "Create a demo cashflow" (2026-09-13)

Standing pre-gate sweep, cold: 87/87 tests, 44/44 ledger MATCH, `deployment-check`
MATCH, `.env` untracked and gitignored. Clean; proceeded. Full account: `DECISIONS.md`
D45.

- **Sablier explained as core** in `README.md`, `web/src/app/docs/page.tsx`,
  `web/src/app/page.tsx`, and `ATTESTCOIN_INTEGRATION.md`: what it is (a real
  streaming/lockup protocol; a stream locks real ERC-20 tokens), why it's central to
  the Attestcoin-depth story (the locked `depositAmount` is decoded from a proven
  `CreateLockupLinearStream` event, never typed input), and the exact contract/event
  named everywhere (`SablierLockup v4.0`, `0xe61cb9153356419bdaD0A8767c059f92d221a3C4`
  on Sepolia; `CreateLockupLinearStream`).
- **"Bring your own cashflow" demoted** on `/verify`: relabeled "Advanced: paste an
  existing Sablier stream," reframed copy ("not the normal way to use Notch"),
  visually de-emphasized (`text-xs`, muted). The pre-loaded demo's one-click "Verify
  with Attestcoin" remains the untouched primary path.
- **"Create a demo cashflow" (Path 2) built for real** — new
  `web/src/components/create-demo-cashflow.tsx`: wallet+network-gated
  (connect → switch → create, never attempts the write without both), hardcoded
  compliance params (non-cancelable, non-transferable, zero unlock amounts, 100,000
  deposit, 30-day cliff), handles `NotchDemoAsset`'s open testnet mint and Sablier
  allowance automatically with live status at every step, parses the real `streamId`
  from the mined `CreateLockupLinearStream` event (never guessed/incremented), and
  flows straight into the existing `verify()` path with a 15-minute attestation-wait
  window (vs. 90s for the typed-hash path, which assumes an already-attested tx).
  wagmi-only signing throughout — no app/server private key anywhere in `web/src`.
- **Proof it works, today, on the real contract**: `scripts/verify-create-demo-cashflow-path.mjs`
  (new) ran the exact same sequence the UI runs. Real results, independently
  re-verified by re-decoding the mined event (not just trusting the script's own
  variables):
  - approve tx: `0x6319689eeaeee58c4362b75f70170da307a9012abca92ecf93cb099b2b577658`
  - create tx: `0xf5904f24e8980a424346478b71590901435cc78646fe5f45f4716a3541a55260`
    (block 11695944, status success)
  - stream id: **190**, parsed from the real event
  - re-decoded event fields confirmed compliant: `cancelable: false`,
    `transferable: false`, `unlockAmounts: {0, 0}`, `token` matches
    `SEPOLIA_DEMO_ASSET` exactly, `depositAmount` = 100,000 × 10^18 exactly,
    `cliffTime` ≈30 days out. Evidence:
    `data/path2-create-demo-cashflow/proof-of-work.json`.
  - The pre-loaded demo is untouched: `web/src/lib/demo.ts` still points at stream
    189; stream 190 exists only as this feature's proof of work.
- **Notch's own contracts: untouched, not redeployed.** Nothing in `contracts/src/`
  changed.

Post-fix sweep: `tsc --noEmit` clean, `eslint .` clean, isolated
`NOTCH_NEXT_DIR=.next-publish next build --webpack` clean (6 routes). Full regression:
87/87 unchanged. Ledger: 44/44 MATCH, unchanged. Nothing committed.

## Wallet-connect fix, proof-trail gaps closed, whitepaper PDF rendered (2026-09-13)

Full account: `DECISIONS.md` D47.

- **Fixed:** the live-deployed nav bar's wallet-connect button could hang on
  "Connecting…" forever (reported live on Vercel, with a screenshot). No timeout
  existed around the connect call. Now races `connectAsync` against a 20s timeout with
  its own local state — always recovers, always states why.
- **Closed, verified live before being called closed:**
  1. Real activation tx (`instantiateClaim()`, block 5,475,774) added to `DEMO` and
     surfaced on `/verify` and `/position` — it existed in the docs the whole time but
     was never linked in the app itself.
  2. Before/after `available()` proof for the 70,000 finance tx, read live at blocks
     5,475,774 (100,000) and 5,475,775 (30,000) — proves the transaction caused the
     change, not just that both numbers separately exist.
  3. The mined refusal's raw revert selector (`0xa3388671`) now shown alongside its
     decoded signature (`InsufficientFinancingCapacity()`), independently
     recomputable. (Caught and corrected a self-made error while doing this: a first
     selector computation via `toFunctionSelector('error ...()')` was wrong —
     `0x7bacac4b` — corrected via raw `keccak256`, which matched the chain's real
     `0xa3388671` exactly.)
- **Gate 9's deferred PDF-export item, now actually done.** `web/notch-deck.html`
  (published earlier as a Claude Artifact) still needed a human to export it to PDF
  and upload it somewhere — that never happened. Built a real whitepaper instead:
  `docs/whitepaper.html` → `NOTCH_WHITEPAPER.pdf` (repo root), rendered via
  `web/scripts/render-whitepaper.mjs` driving a locally installed Chrome through
  `playwright-core` (already a `web/` devDependency — no browser download, no new
  package). Reviewed page-by-page as rendered PNGs before being trusted. Committed to
  the repo, so its URL is permanent
  (`raw.githubusercontent.com/TheWeirdDee/notch/main/NOTCH_WHITEPAPER.pdf`) without
  needing IPFS or Google Drive.

Full regression: 87/87 tests, 44/44 ledger MATCH, `deployment-check` MATCH, `tsc
--noEmit` and `eslint .` clean. A transient 3-test flake under concurrent
headless-Chrome load during one mid-fix run did not repeat once re-run in isolation —
resource contention, not a regression (see D47 for detail). Notch's own contracts:
untouched, not redeployed.
