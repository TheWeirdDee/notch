# Claims

Every public sentence Notch makes must map to a receipt or a named limitation (PRD Gate
9 pass rule, acceptance criterion 8). This file tracks claims as they become provable.

## C1 — Gate 1 decode seam works, end to end, on real infrastructure

**Claim:** Notch can decode a financing capacity from a real Ethereum cashflow without
any user-supplied amount, verified through Attestcoin on Creditcoin.

**Evidence:**
- Sablier stream 177 created on Ethereum Sepolia, deposit 100,000 `NotchDemoAsset`,
  non-cancellable, zero unlock amounts, future cliff. Tx
  `0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8`.
- Attestcoin inclusion proof fetched live from the ProofBuilder API:
  `data/gate1/attestcoin-proof.json`.
- Proof verified on-chain via the BlockProver precompile on Creditcoin CC3 Testnet, tx
  `0x5c0ee8c904f66ace23bb56740048301ad375aad3ab682d6f9519e78d11029e89` (contract
  `Gate1DecodeProbe` at `0xf22eb0ecf36cc05964cefa1e759bb9f20535c292`).
- `depositAmount` and `unlockAmounts` decoded from the verified transaction's
  `CreateLockupLinearStream` event (not calldata, not `totalAmount`, not typed) and
  matched the source Sepolia record on every field: `data/gate1/verify-and-decode-result.json`.

**Denominator:** one run, the make-or-break Gate 1 spike. Not yet a campaign statistic —
this is proof the seam works, not a measured rate. See `GATES.md` Gate 1 for the full
step-by-step chain and `DECISIONS.md` D8 for what it settles.

## C2 — Gate 2 reference model: conservation and capacity rules hold, deterministically

**Claim:** Notch's capacity math (decode-gated instantiation, conserved financing, over-
draw refusal, re-instantiation refusal, broker-fee-immune capacity) is specified as a
pure, deterministic function, not left implicit in prose — and Gate 3's Solidity is
required to match it, field for field, not just in spirit.

**Evidence:**
- `core/reference_model.md` — the full spec: permit-condition tables in enforcement
  order for both `instantiate` and `apply`, the `claimId` encoding, and every deviation
  from `Notch-PRD.md` Appendix C's literal text, each justified against a specific
  required fixture (see `DECISIONS.md` D9).
- 16 fixtures, each with a golden expected-output file, covering: zero-amount, exact-
  remainder, remainder+1 over-draw, a two-lender race (using the PRD's own 70k/30k/50k
  demo numbers), replay of the same source tx, wrong chain key, a failed (reverted)
  receipt, a cancelable stream, non-zero unlock amounts, a past cliff, a wrong source
  contract, a broker-fee `totalAmount` that must be ignored in favor of the event
  deposit, an inactive claim, an unauthorized caller, a fake merkle proof, and a missing
  precompile. `core/fixtures/`, `core/fixtures/golden/`.
- `core/src/model.test.ts`: 24 tests passing, including four pass-bar assertions stated
  explicitly (over-draw rejected, re-instantiation rejected, failed receipt creates no
  claim, capacity = event deposit not `totalAmount`) and two determinism checks (same
  input twice, byte-identical output).
- Fixtures build on the real Gate 1 Sablier stream (tx `0x9d3a4...80cc8`, stream 177,
  real claimId `0x2f3515...6d9137`) wherever a real value applies; every synthetic
  fixture says so and states exactly what was changed.

**Denominator:** 16 named cases, all passing; not a campaign statistic. This is the spec
Gate 3's contracts are tested against next, not a measured production rate. See
`GATES.md` Gate 2 and `DECISIONS.md` D9-D10.

## C3 — Gate 3: the contracts are live on Creditcoin CC3 Testnet and enforce conservation for real

**Claim:** `AttestedCashflowRegistry` and `CashflowLendingVenue` implement the Gate 2
reference model on-chain — capacity decoded from a verified transaction, never typed;
conservation enforced across independent lenders; re-instantiation and bad-shape sources
refused — and this was proven against real infrastructure, not asserted.

**Evidence:**
- Deployed contracts: `data/gate3/deployment.json` (addresses in `GATES.md` Gate 3).
- The real Gate 1 Sablier stream instantiated on-chain: capacity `100,000 * 10^18`,
  decoded, matching the source exactly. `data/gate3/real-claim.json`.
- Two distinct funded lenders (never the same key): Lender A finances 70,000 and later
  the exact 30,000 remainder, exhausting capacity to precisely 0; Lender B's 50,000
  over-request against the 30,000 remaining is refused on-chain with
  `InsufficientFinancingCapacity` — the PRD's own money-shot numbers, achieved for real.
  `data/gate3/finance-and-parity-results.json`.
- Re-instantiation of the same source reverts (`ClaimAlreadyActive`); a deliberately-
  reverted Sepolia transaction and a real `cancelable=true` stream both create zero
  capacity, each independently proven and verified rather than simulated.
  `data/gate3/proof-negative-tests.json`, `shape-and-receipt-tests.json`.
- 13 of the 16 Gate 2 fixtures have recorded live outcomes, including successes and named
  rejections; the remaining 3 are named with a specific reason, not silently skipped (see
  `DECISIONS.md` D15).
- A decimals-mismatch bug that would have silently defeated conservation in production
  was found and fixed by this gate's own real testing, not by inspection — full account
  in `DECISIONS.md` D14. The bug and the fix are both part of this claim's evidence: the
  process caught a real defect before it reached a demo audience.

**Denominator:** one deployment, 13/16 fixture cases proven live plus the 3 required
demo proofs (instantiate, two-lender conservation, refused replay/bad-shape); not a
campaign statistic. See `GATES.md` Gate 3 for the full breakdown and every tx hash.

## C4 — Gate 4: 10 PAPER receipts on live proofs, every one independently recomputes

**Claim:** Notch produces recomputable receipts — a third party can rerun the reference
model from a receipt's own recorded data and get the same answer — for both successful
and refused actions, across all four required journeys, using real Attestcoin proofs and
real on-chain verification throughout.

**Evidence:**
- 10 PAPER receipts, `data/ledger.jsonl` / `data/receipts/` — full list with journey,
  action, and outcome in `GATES.md` Gate 4.
- `npx tsx cli/src/index.ts verify <id>` run against all 10: **10/10 MATCH.**
- The verifier was checked against a real negative: a deliberately tampered receipt
  (one field changed) was run through it and correctly printed `DRIFT`, catching it on
  two independent checks (hash integrity and recomputed capacity math) — the tampered
  copy was then deleted, not kept as a demo prop.
- J2 (second lender refused) and J3 (fake proof / wrong-shape source refused) each
  produced a receipt with the correct `reason_code`, not a crash or a silent drop; J3a's
  "fake" proof was a real on-chain call to the real precompile with one merkle sibling
  corrupted, not a hardcoded failure.
- Exact conservation: `financedCapacity` after the exhaustion draw equals
  `originalCapacity` exactly (not merely "within dust").
- Proof freshness is an enforced code path (`StaleProofError`), not a manual habit — see
  `DECISIONS.md` D18.

**Denominator:** 10 receipts, all 10 verify; 1 deliberate DRIFT test, correctly caught.
Not a campaign statistic — that's Gate 7. See `GATES.md` Gate 4 for every receipt ID.

## Gate 5 — J5 recovery evidence (2026-09-09)

**Claim:** The real adapter/CLI PAPER pipeline survives the injected process crashes,
response/proof timeouts and retries with exactly one simulated effect per intended
loan and consistent, fully resolved receipt histories after successful recovery.

**Evidence:** 12/12 recovery tests in `adapter/test/recovery.test.ts`, machine results in
`data/gate5/vitest-results.json`, retained event/effect/receipt artifacts located by
`data/gate5/latest-run.json`. GATES.md records each scenario and outcome: real child
kill, post-effect throw, post-commit timeout, hanging HTTP proof request abort, two
retries, pending-before-new-work boot ordering, stale-proof refetch, instantiate crash,
receipt acknowledgement loss, query failure, concurrent writer, and Gate 4 regression.
A failed query blocks new work until recovery succeeds; confirmed absence is recorded
as abandoned rather than silently removed. Reusing a loan intent with changed parameters
is rejected. Every recovered effect receipt recomputes MATCH.

**Regression:** 10/10 original Gate 4 receipts remain MATCH; a tampered copy still fails
hash integrity and recomputed claim independently. 28 core tests pass; adapter and CLI
typechecks pass. Root `npm test` now includes recovery tests.

**Boundary:** PAPER disbursements only, explicitly labelled and excluded from LIVE.
Injected tests use synthetic proof fixtures and actual durable PAPER state, not live
settlement. The local HTTP abort is real; post-commit RPC timeout is an injected
exception. No claim of live chain crash recovery, disk-loss/power-loss resilience or
multi-host coordination. No frontend, live micro-loan, or commit was made. Gate 6 has
not started.

## Gates 1–5 audit qualification (2026-09-09)

Earlier claims are qualified by `AUDIT-GATES-1-5.md`. Capacity conservation at the
recorded whole-token draws remains evidenced, but unconditional loan-only consumption
is false with the owner-updatable venue, and sub-settlement-unit draws can consume
capacity while paying zero. Both were executed in a discarded read-only EVM call with
synthetic initial state, not a live disbursement. Model/PAPER and on-chain claim IDs
also differ. These are open pre-Gate-6 remediation items.

Recorded live fixture coverage is 13/16, not 14/16. Four recorded successful CC3
transactions were independently re-read and remain successful; 10/10 Gate 4 receipts
still MATCH. Local adapter/verifier fixes pass 15 new audit tests plus all 40 prior
tests. Evidence: `data/audit-gates1-5/`. Nothing committed or deployed.

## C5 — Gate 5 recovery, and the P1 contract findings above are now fixed (independently verified, 2026-09-09)

**Claim:** the pipeline is crash-safe and idempotent for PAPER actions (Gate 5's actual
scope), and the three P1 contract findings the audit above left open are now resolved in
source — independently confirmed by reading the contract code directly and re-running
the full test suite cold, not by trusting either the recovery implementation or the
audit's own account of itself.

**Evidence:**
- `adapter/test/recovery.test.ts`: 12/12, covering every injected-failure scenario Gate
  5 requires — real child process kill, real aborted hanging HTTP call, thrown
  mid-flow timeouts, two retries of one logical action, restart with a pending receipt,
  stale-proof refetch under the same key, concurrent-writer rejection. Detail and
  per-scenario outcomes: `GATES.md` Gate 5.
- The owner-bypass, zero-settlement, and claim-identity P1s from the audit qualification
  above: all three confirmed fixed by reading `contracts/src/AttestedCashflowRegistry.sol`
  and `CashflowLendingVenue.sol` directly (not the interrupted session's summary of them).
  Full mechanism of each fix: `GATES.md`, "Follow-up" section, and `DECISIONS.md` D23.
- One real bug found and fixed during this verification pass: the new contract test
  suite's revert-matching helper couldn't decode a cross-contract error (a registry
  error surfacing through `venue.finance()`), because it checked only the called
  contract's ABI. Confirmed the *contract* was correct throughout via a raw `eth_call`
  (the right error selector was in the response the whole time). Fixed the test, not
  the contract: 4 tests went from failing to passing.
- Cold full-suite re-run after that fix: **82/82 passing** (28 core, 34 adapter, 20/20
  contracts). Strict typechecks clean. All ten original Gate 4 receipts still `MATCH`.
- No new deployment, no new secrets, nothing committed. `.env`'s live venue address is
  unchanged from Gate 3 — nothing was broadcast to CC3 Testnet during any of this.

**What this does not claim:** the fixes are not live. The registry and venue actually
deployed on CC3 Testnet right now are still the original Gate 3 ones, with all three P1s
still present in them. Gate 6 must deploy the current, fixed source — and re-instantiate
the real Gate 1 claim against it — before originating any live loan; it must not
originate one against what's currently deployed.

**Denominator:** 12/12 recovery scenarios, 3/3 P1 findings independently confirmed
fixed, 82/82 tests passing after 1 test-harness bug found and fixed. Not a campaign
statistic. See `GATES.md` and `DECISIONS.md` D23 for full detail.

## C6 — Gate 6: real ccUSD moved, real over-draw refused, real concurrent race resolved correctly — on a fresh deployment of the fixed contracts

**Claim:** the fixed contracts (D23) work correctly under real, live conditions — not
just against a local test harness — including the one scenario that could only ever be
exercised for real: two independent lenders racing the same residual under true
concurrent execution.

**Evidence:**
- Fresh deployment of `MockUSDC`/`AttestedCashflowRegistry`/`CashflowLendingVenue`
  (the registry self-deploys its own immutable venue). Both the superseded Gate 3
  addresses and the current Gate 6 addresses are recorded side by side —
  `GATES.md` Gate 6, `data/gate6/deployment.json`.
- A real, unavoidable discovery before any loan could be written: the original Gate 1/3
  position (`transferable=true`) can never satisfy the new registry
  (`transferable=false` required) — Sablier streams are immutable, so a fresh
  rule-compliant stream (180) was created instead, sized small on purpose for a
  micro-loans gate. `TransferableNotAllowed` reverted exactly as it should have.
- Real capacity instantiated (1,000, decoded event deposit, exact match), two distinct
  funded lenders (same wallets as Gate 3/4), a real 600-unit draw with real ccUSD
  transferred, a real on-chain-refused 500-unit over-draw, exact exhaustion
  (`financedCapacity === originalCapacity` on-chain), and a real concurrent two-lender
  race (`Promise.allSettled`, both legs landing in the same block, resolved correctly by
  transaction index order — first applied wins, exactly as the model requires).
- **The receipt-writing process itself failed three times before succeeding, and each
  failure was caught by `notch verify` reporting DRIFT, not by inspection**: a validator
  correctly rejecting an incomplete `attestedTxDigest`, a hand-typed Solidity-style
  `reason_code` that could never match the model's own vocabulary, and — the most
  substantive of the three — a concurrent-race receipt recording submission-time state
  instead of true on-chain execution order, which `notch verify` caught because the pure
  model, given the wrong `claim_before`, correctly predicted a different outcome than
  what actually happened on-chain. All three are now RULES.md rows (B29–B31). Full
  account: `DECISIONS.md` D24.
- The six malformed intermediate receipts were never edited in place — they were voided
  (preserved at `data/gate6/void-receipts/`, removed from the active ledger, not
  deleted) and superseded by correctly-built receipts referencing the identical six real
  transactions. Nothing was resubmitted on-chain to fix a bookkeeping bug.
- Final state: **16/16 receipts verify MATCH** (10 original Gate 4 PAPER + 6 new Gate 6
  LIVE) — no regression to the historical receipts from any of this. `npm test` → 82/82,
  unchanged from Gate 5, confirming the deployed bytecode matches what was tested
  locally.

**Denominator:** 6 LIVE receipts (3 successful, 3 refused, all verify), 1 real
concurrent race with confirmed correct on-chain resolution, 3 receipt-construction bugs
found and fixed via the verifier's own DRIFT signal (not by inspection). Not a campaign
statistic — that's Gate 7. See `GATES.md` Gate 6 for every tx hash.


## C7 — Gate 7: over-financing prevention is measurable, real, and survives having its own evidence checked

**Claim:** on a frozen, real, rule-compliant 5-position set with 3 funded lenders, the
product's shared conservation (`full`) demonstrably prevents over-financing that a
per-lender-ceiling design (`no_conservation`) or a no-ceiling design
(`single_lender_guard`) would allow — 3280 units across the set — and every real,
receipted claim in that campaign still verifies MATCH after the campaign's own output was
checked hard enough to find and fix three separate real bugs in how it was produced.

**Evidence:**
- Frozen-set hash `0x1f5f0838...` committed to `GATES.md` before any finance scenario
  ran; the 5 real Sepolia positions (streams 181–185, deposits 500/800/1200/600/1000,
  `cancelable=false`, `transferable=false`) were created first (their tx hashes are part
  of what's hashed) but not one `instantiateClaim` or `finance()` call preceded the
  commit. One transparent, pre-execution revision to the draw plan (removing a literal
  actionKey-replay step the pure model could never reproduce) is recorded alongside both
  hashes.
- 31 real on-chain interactions: 5 fresh-proof-then-instantiate sequences, 20 real
  `finance()` attempts (5 succeeded, moving real ccUSD; 15 refused), 5 real
  re-instantiation attempts (all refused), 1 real fake/wrong-shape-source attempt (real
  Gate 3 `cancelable=true` stream, freshly re-proven, decoded for real — not
  fabricated — and correctly reverted `CancelableNotAllowed`).
- **Every refusal was independently re-diagnosed against the real chain, not trusted from
  the campaign script's own labels.** 12 of 15 finance refusals were genuine
  `InsufficientFinancingCapacity`; 3 were something else entirely (an actionKey collision
  with Gate 6's own prior history, and two real lender-allowance shortfalls) — found by
  historical-block `simulateContract` replay, voided rather than left mislabeled.
  Separately, running `notch verify` on every new receipt (not spot-checking) found two
  more construction bugs — inconsistent address casing, and a missing `claim_before` that
  broke `CLAIM_ALREADY_ACTIVE` reproducibility — affecting 10 more receipts. All 13
  voided receipts are preserved in `data/gate7/void-receipts/`, documented with their
  true cause, never deleted; the 10 casing/claim_before ones were rebuilt referencing the
  identical real transactions, nothing resubmitted on-chain.
- `user_supplied_amount`: a deliberately wrong typed amount (1507) disagreed with the
  real decoded `depositAmount` (500) as required, and the production `instantiateClaim`
  ABI was directly inspected to confirm it carries no amount-shaped parameter at all —
  this ablation is structurally non-callable on the real contract, not merely refused.
- Final state: **44/44 ledger receipts verify MATCH** (16 pre-Gate-7 + 28 active Gate 7),
  including a full re-verify of every Gate 4–6 historical receipt — no regression from
  any of this gate's work.
- Two real infrastructure bugs found and fixed along the way, unrelated to the
  conservation logic itself: a proof-freshness check with no tolerance for ordinary clock
  skew (blocked the campaign's first attempt outright), and the actionKey/allowance
  causes above. Full account: `DECISIONS.md` D26–D28.

**Denominator:** 3280 units over-financing prevented, across 5 positions × 4 draw steps
× 3 lenders, same fixed draw plan and same real decoded capacities across all four
ablations. 28 active Gate 7 receipts (5 instantiate, 5 finance-succeeded, 12
finance-refused-for-capacity, 5 re-instantiation-refused, 1 fake-source-refused), all
MATCH. Not a single clean run polished for presentation — the published record includes
every voided attempt and its real cause. See `GATES.md` Gate 7 and
`data/gate7/campaign-report.json` for every receipt id and tx hash.


## C8 — Gate 8: the frontend is real end to end, with one honestly-stated gap

**Claim:** the three surfaces (Verify, Position, Activity) plus an independent recompute
view are built against live Creditcoin/Sepolia state with no mocked data, exercise the
exact PRD money-shot numbers for real, and the underlying on-chain logic is
independently proven correct — but a live browser click-through was not performed by
this session, because no browser automation tool is available here.

**Evidence:**
- Pre-gate sweep clean before any Gate 8 work: 84/84 tests, 44/44 ledger receipts MATCH,
  deployment addresses reconciled against GATES.md, `.env` confirmed gitignored and
  untracked.
- `next build --webpack` succeeds cleanly (`▲ Next.js 16.3.4 (webpack)`); `tsc --noEmit`
  strict passes; `eslint .` passes with zero errors after fixing two real React-purity
  issues (not suppressing the lint); `npm audit` reports 0 vulnerabilities.
- A real 100,000-deposit Sepolia stream (186) was created as the dedicated demo
  position, distinct from Gate 7's real smaller-scale evidence set — both scales are
  real and neither was adjusted to match the other (D29 covers why 16.3.4, not the
  16.2 pin — a disclosed critical Windows RCE, not a preference).
- `scripts/gate8-integration-check.mjs` ran the identical call sequence the UI code
  performs — fresh proof, real `instantiateClaim`, real `finance()`, a real
  `simulateContract` refusal — and produced, on the real demo position: capacity
  100,000, a real 70,000 loan (tx `0xa4c1848f...`), available 30,000, and a real refused
  50,000 request (`InsufficientFinancingCapacity`) — the PRD's Appendix E money-shot
  numbers exactly, achieved by real on-chain state, not by adjusting a display value.
- RULES.md F1/F2/F6/F7/F10 checked by direct scan (Unicode-range emoji scan, `<img`
  grep, ethers/`@gluwa/usc-sdk` grep, banned copy grep): all clean. F11 (no typed-amount
  path to production) satisfied by construction — no such input exists anywhere in the
  app; Position's "Amount to finance" chooses how much of already-decoded capacity to
  draw, never asserts what the capacity is.
- No regression: 84/84 tests and 44/44 ledger receipts unchanged after this gate (Gate 8
  touches no ledger receipt at all — it's a live dApp, not a PAPER/LIVE receipt flow).

**What this claim does NOT cover:** an actual human or tooled browser session clicking
"Connect wallet," signing a real MetaMask prompt, and watching the refusal render live.
That specific pass-bar item is marked open, not quietly assumed, in `GATES.md`'s Gate 8
checklist and `DECISIONS.md` D30.

**Denominator:** 1 real demo position, 3 real transactions (instantiate, 1 successful
finance, 1 real-simulated refusal) reproducing the PRD's exact worked example, 5 routes
building and serving cleanly, 0 vulnerabilities, 0 regressions. See `GATES.md` Gate 8
for every tx hash and explorer link.


## Audit remediation closure ? 2026-09-10

The prior audit findings are now resolved in source/tooling as recorded in AUDIT-GATES-1-5.md. Contract tests prove exact settlement, immutable venue, claim-ID parity, all original fixture cases at a synthetic local boundary, expiry and idempotency; actual concurrent publisher processes lose no receipts. Versioned manifests and evidence history prevent stale metadata and overwritten run evidence. Current deployed topology matches its manifest in a read-only check. All 16 ledger receipts independently recompute MATCH. No new deployment, loan or commit was made here. Historical missing live proofs remain explicitly unclaimed.

## Frontend correction evidence — 2026-09-11

Verified in actual Chrome desktop and mobile: landing CTA, preloaded real stream 186,
fresh Attestcoin proof verified by the live registry, existing-claim reuse, current
capacity, exact contract overdraw refusal, and visible settlement/refusal Activity.
Mobile additionally refused malformed input and a real proof with a wrong stream,
then successfully reset and verified the real demo. Denominator: one real source,
two browser viewport flows, no mocked infrastructure responses, zero runtime errors
in final runs. Evidence: data/gate8/browser-desktop-result.json,
browser-mobile-result.json and corresponding screenshots. Full suite 87/87; ledger
44/44 MATCH; deployment manifest MATCH. See D35–D37 and Gate 8 correction.

The final current balance is zero available of 100,000 (70,000 + 30,000 settled loans).
The landing's 30,000 remainder is a labelled earlier recording. No new signed loan
was made in this correction; viewing settlement and checking a refusal are not a
claim of new disbursement. Original wallet-finance browser acceptance remains open.

## C8 correction — 2026-09-11

**C8's original claim that the frontend had "no mocked data" was wrong at the time it
was written.** A direct code audit (by the user, not a click-through) found Position
and Activity were silently injecting a fixed historical loan (`lib/demo-loan.ts`) into
displayed history whenever the real event-log query came back without one — exactly
the fabrication C8 claimed didn't exist. Not shrinking or deleting C8; correcting it
here per the project's evidence-corrects-claims discipline.

**Fixed, and now genuinely true:** Position and Activity read only real
`LoanOriginated` logs; an empty real result renders as empty, never backfilled. The
read-only-only overdraw "check" C8 described has also been replaced — it's now a real,
broadcast, mined, reverted `finance()` transaction from a second distinct demo lender
(server-signed, key never reaches the client), confirmed against a live claim: tx
`0x3c3f167b411d80b9cd05e245ab76fa3870a0bda38e2ddddeb62290c6d67be136`, `status:
reverted`, decoded revert `InsufficientFinancingCapacity`. Tour-chrome labeling
("Step X of 3", "The demo position") removed from Position and Verify. A WHO section,
a 6-question FAQ, and a `/docs` route (previously entirely missing from the landing
page, despite being an explicit pass-bar item) are now built and linked from the nav.

Full account, including the real viem gas-estimation bug found while fixing the
refusal mechanism (a guaranteed-revert call never broadcasts without an explicit gas
limit): `DECISIONS.md` D38, `GATES.md` Gate 8 second correction. Validation:
`tsc`/`eslint`/`next build --webpack` all clean; full suite 87/87; ledger 44/44 MATCH
— unchanged, this round touches no ledger receipt. Not independently re-confirmed by
me at 375px in an actual browser (D30's no-browser-tool limitation still applies to
this session); the prior round's real mobile-Chrome pass (D36) predates this round's
page rewrites and should be re-run against the current code.

**Update, 2026-09-12 (D39):** the `/api/overdraw` route referenced above was
superseded by `mined-refusals.ts`/`.tsx`, which re-verifies real historical reverted
transactions live rather than broadcasting new ones — the tx hash above still checks
out, now discovered and re-verified that way instead. Also fixed: wallet connections
were silently dropped on every page refresh (missing `useReconnect()` on mount),
found directly by the user.

## Current publication boundary — 2026-09-12

The current 50,000 ccUSD refusal for stream 186 is a real mined reverted transaction:
0xa9b55a55e918a1e8c344ac07d5aac502af10d85b609cc2a37cbce254e6de51ac.
Its remaining capacity was zero before and after; no disbursement occurred. The
second lender differs from the first settled lender. Live registry and event reads
supply the product figures; receipt hashes only locate evidence, never provide a
snapshot fallback. See D39 and dashboard-mined-refusal.json. No mainnet settlement,
repayment, or protection against an external lending registry is claimed.

## C9 — Gate 9: submission materials are real and accurate, with two honestly-stated gaps

**Claim:** the README, integration doc, and deck lead with real evidence and make no
claim beyond what's proven; the two items this session could not physically produce
(a recorded video, a posted forum question) have complete, ready-to-use substitutes
instead of being silently skipped.

**Evidence:**
- `README.md`'s headline (3,280 units over-financing prevented, denominator 5
  positions × 4 draw steps × 3 lenders) is the same number `GATES.md` Gate 7 and
  `CLAIMS.md` C7 already established — not a new or rounded figure. Its three
  explorer links resolve to real, currently-valid transactions (stream 189, not the
  expired stream 186).
- `ATTESTCOIN_INTEGRATION.md`'s calldata-fallback claim (FIX 1, D41) was verified by
  reading `AttestedCashflowRegistry.sol` directly — there is no fallback code path,
  confirmed, not inferred.
- The deck's competitive framing quotes the PRD's own section 3 language and names
  only entries `DECISIONS.md` D5 item 10 already permits naming.
- `DEMO_SCRIPT.md` and `CODESIGN_QUESTION.md` exist specifically because this session
  checked for recording/posting capability and found none, rather than assuming or
  guessing at what those deliverables should contain.

**What this claim does NOT cover:** an actual recorded video, or an actual posted
Discord/Slack message. Both are marked open in `GATES.md` Gate 9, not folded into a
blanket "submission complete."

**Denominator:** 5 real submission artifacts produced (README, integration doc, deck,
demo script, co-design draft), 2 genuinely not producible by this session and said so
directly, 0 regressions (87/87 tests, 44/44 ledger MATCH unchanged). See `GATES.md`
Gate 9 for the full account.
