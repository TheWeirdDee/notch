# Gates 1–5 audit — 2026-09-09

## Remediation closure — 2026-09-10

The findings below are the **historical pre-fix audit**, retained rather than erased.
The known source/tooling defects are now addressed. The workspace also contains a
newer Gate 6 deployment from separate work; its current registry/venue/token/decimal
topology was independently checked read-only in this turn and matches the manifest.
No deployment, live transaction or commit was performed in this closure pass.

| Original finding | Resolution |
|---|---|
| Zero-payment/rounded settlement | Exact representability enforced in the venue and version-2 model; dust and inexact amounts revert/refuse without consumption. |
| Owner can bypass origination | Registry constructs its own immutable venue; owner replacement always reverts. |
| Model/PAPER/chain identity mismatch | Versioned authenticated txBytes digest, model/contract parity test, and additive legacy-balance bridge. Old receipts retain their original identity and hash. |
| Stale deployment manifest | `data/deployments/current.json` is a versioned latest view backed by immutable history; `notch deployment-check` detects topology/decimal drift. Old Gate 3 manifests are historical. |
| Loose historical test runners | Incompatible Gate 3 runners are explicitly retired before they can broadcast or misreport results. Their replacement is the root-test contract suite, with exact decoded revert checks and mined transfer-rollback assertions. The current deployer checks receipt status and requires explicit `--broadcast`. |
| Coverage overstated | Historical count corrected to 13/16 live cases. Automated local-EVM tests now exercise all 16 original cases plus rounding, immutability, expiry and idempotency checks. Synthetic boundaries stay labelled; no missing historical live proof is fabricated. |
| First-event selection | Adapter and registry select the requested stream; tested against a transaction-shaped receipt containing two streams. |
| Concurrent receipt publication | Shared OS lease protects publication independently of PAPER-store locks. Two actual publisher processes preserve all 24 distinct receipts; repeated publication is idempotent. |

Further audit items are addressed: new proof payloads are stored by content hash;
nontransferable sources and pre-cliff lending are enforced for version 2; Solidity
integer widths and runtime fields are validated; loan action keys are consumed
atomically on-chain. Evidence-writing scripts now retain immutable old and new JSON
snapshots before replacing a latest view. The historical pre-fix audit harness is
retired in favor of the current automated suite.

Validation: the full pre-existing 82-test suite passes, followed by the expanded
9-test remediation file (two new tests for manifest drift and retained evidence),
bringing the tested inventory to 84. Adapter/CLI typechecks pass. All 16 current
ledger receipts MATCH, including all ten original Gate 4 PAPER receipts. The only
test adjustment needed on the current busy host was giving the real child-process
crash test a 30-second outer timeout instead of the default five seconds; all crash
and recovery assertions remain unchanged.

Historical coverage and data cannot be recreated retroactively: the original three
missing live cases and unavailable historical submitted-proof payloads remain named
limits of the original evidence. New local tests and retained payloads are not
presented as replacement historical live proof.

## Historical audit (superseded by closure above)

**Result: do not proceed to Gate 6 yet.** The historical successful transactions
were independently re-read and are successful, and all ten Gate 4 receipts still
MATCH. However, contract correctness and integration gaps remain. Nothing was
deployed, broadcast or committed during this audit.

## Open findings, highest priority first

| Priority | Finding / trigger | Evidence and consequence | Required resolution |
|---|---|---|---|
| P1 | Positive finance amount rounds to zero settlement | `CashflowLendingVenue.sol:69–81`: 18-to-6 conversion floors. Read-only EVM harness executed actual venue code: amount `1` consumed `1` capacity with `0` ccUSD and no allowance/funds. Nonmultiples of `10^12` also lose dust. | Specify representable amounts, reject zero/inexact conversion, align PAPER/model settlement semantics, test and redeploy before live origination. Source and deployed contract remain unchanged in this audit. |
| P1 | Owner bypasses loan-only consumption | `AttestedCashflowRegistry.sol:149`: owner may set itself as venue, then call consume directly. Harness executed this with production registry code: cumulative capacity consumed `1001`, ccUSD paid `0`. | Lock venue after bootstrap or explicitly redesign and disclose privileged upgrade authority. D14 intentionally introduced this capability; it contradicts an unconditional claim that capacity falls only through a loan. |
| P1 | Model/PAPER claim identity differs from registry identity | `core/src/instantiate.ts:63` hashes source tx hash; registry line 238 hashes authenticated txBytes digest. Gate 4 ID is `0x2f3515684d371770be9fa985bf14d9ced224f5c6801684c8e03d46a2a26d9137`; recorded real chain ID is `0x99161b1e0e9f40613c9f07f522ca412085919df2617831a972139508503cfae9`. | Carry authenticated digest / explicit chain identity through proof, model, receipt and reconciliation. Preserve legacy receipts with a versioned scheme. D11 explains the difference but does not implement the bridge. Never change the registry back to trusting caller-supplied tx hashes. |
| P2 | Deployment manifest points at obsolete venue | Live registry reports `0x24cA704f62793BAdC0bB7cbfd2393A1A63E5f5A0`, while `data/gate3/deployment.json` reports `0x595e0b3ba3b39084addf8ecd0c185976c307a7d3`. `redeploy-venue.mjs` updates .env but not the manifest. | Treat the original manifest as historical. Current observed topology is saved in `data/audit-gates1-5/contract-readonly.json`; add versioned deployment records and drift checks before live execution. |
| P2 | Contract test/evidence runner can misclassify failures | `gate3-finance-and-parity.mjs:46–70` treats any caught error as expected rejection and does not assert receipt.status before recording SUCCEEDED. Several runners overwrite fixed filenames; no contract tests run under npm test. | Assert decoded expected reverts, mined status, transfers, and conservation; fail the command on unexpected outcomes; retain each run. The four historical positive transactions checked in this audit really did succeed. |
| P2 | Gate 3 fixture coverage was overstated | The required 16 include past-cliff. Broker-fee divergence, wrong-source-contract, and past-cliff lack live fixture evidence: **13/16 recorded live cases, not 14/16**. Success cases also should not be called “reverts.” | Coverage wording corrected; fill the three named gaps and add independent contract differential tests. The read-only audit now separately demonstrates transfer-failure rollback using synthetic seeded state. |
| P2 | First-event selection ignores requested stream | Registry event loop and adapter `findAndDecodeStreamEvent` take the first matching event. The CLI accepts streamId, but assembly has no stream selection argument. | Select the requested stream from authenticated logs consistently in both layers. Current single-stream Gate 1 evidence is unaffected; later streams in a batch cannot be imported correctly. Static finding, no batch transaction submitted. |
| P2 | Shared receipt publisher has no independent writer lock | `appendReceipt` atomically replaces a read-modify-written global log. The PAPER store lease protects one store, not other stores or direct legacy-script callers sharing that log. | Put publication under a shared lock/store transaction and test competing processes. Current recovery tests prove one pipeline store, not arbitrary concurrent publishers. |

## Fixed locally during this audit

The first 12 adversarial assertions **all failed before fixes**. Retained evidence:
`data/audit-gates1-5/before-fixes.json`. Fixes and three additional checks now pass:

- Verifier now recomputes before/after capacities, checks claim identity and proof
  relationships, checks success/refusal field consistency, and compares original
  capacity/borrower/asset/lock to decoded proof fields. A recomputed hash no longer
  masks these inconsistent fields. Malformed arithmetic returns DRIFT instead of
  crashing; negative/out-of-range financing state is rejected; object key ordering
  does not cause false drift. This remains offline consistency checking, not an
  independent cryptographic proof or historical storage verification.
- RPC/decoder transport errors propagate instead of being converted into definitive
  proof failure or failed/missing receipt facts. Explicit EVM verification reverts
  still produce proof rejection. No claim that all possible revert reasons can be
  distinguished as retryable from their text alone.
- ProofBuilder response chain/transaction must match the request. This prevents a
  mismatched response from being relabelled with the requested provenance; it does
  not cryptographically derive the Ethereum transaction hash from txBytes.
- PAPER finance rejects unverified/failed proof results at its provider boundary.
  The normal assembler already returns no matching event on verification failure;
  the new guard also makes this invariant explicit for alternate/direct providers.
- PAPER captures the action before awaiting, preventing caller mutation from
  changing loan parameters after the key has been derived.
- Durable PAPER effects are checked for receipt hash integrity, duplicate keys,
  receipt/key agreement and mode before being used. This detects corrupted data;
  an unkeyed hash is not authentication against a party that controls the disk.

## Boundaries and remaining integration work

- Gate 5 proves local durable PAPER recovery, not live transaction recovery. The
  deployed finance interface has no business action key, and two identical loans
  are otherwise valid. Gate 6 must reconcile transaction identity and pending nonce
  state or introduce on-chain idempotency; querying only remaining capacity is not
  sufficient to identify one loan after an ambiguous response.
- Fresh ProofBuilder payloads are not retained per receipt by the CLI. A payload hash
  and recorded decoded fields allow offline consistency checks but do not let a
  third party replay the original precompile call. The corrupted-proof Gate 4 case
  also does not retain its submitted sibling mutation in its receipt.
- The claim records creation-time recipient and deposit. Transferability/current
  ownership is not tracked, and finance does not check that the cliff is still in
  the future. These are historical inclusion/escrow boundaries, not proof of current
  collateral control. No repayment or escrow functionality was added in this audit.
- Pure core functions rely on typed, ABI-valid facts and do not fully validate all
  Solidity integer widths/runtime JSON fields. The verifier gained targeted input
  checks, but this is not a complete schema-validation audit or full EVM equivalence.

## Verification performed

- `npm test`: **55 passing** (28 core, 12 prior recovery, 15 audit).
- Adapter and CLI strict typechecks pass.
- All ten original Gate 4 receipts MATCH. Independent hash/math tampering still DRIFT.
- `scripts/audit-gates1-5.mjs` compiled production Solidity plus an explicitly
  synthetic seeded-registry harness and ran it through read-only `eth_call`. It
  demonstrates zero-payment consumption, privileged consumption, and successful
  rollback after a failed nonzero transfer. No contracts or state persist from it.
- The Gate 1 decode transaction, Gate 3 instantiate transaction, 70,000 draw and
  30,000 final draw were independently fetched via RPC: all four status success.
- Detailed machine evidence: `data/audit-gates1-5/after-fixes.json` and
  `data/audit-gates1-5/contract-readonly.json`.

Gate 1's seam evidence remains valid. Gate 2's existing fixture results remain valid
within the recorded model. Gate 3 requires remediation before live progression.
Gate 4 historical receipts remain valid as offline model receipts. Gate 5's tested
single-store PAPER recovery remains valid with the local fixes and stated boundaries.
