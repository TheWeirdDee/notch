# Notch Mini PRD

Product requirements · BUIDL CTC 2026 Fall · Attestcoin Protocol · v1.0 LOCK

A conservation layer for cross-chain cashflow-backed lending. A real Ethereum cashflow is proven to Creditcoin by Attestcoin; Notch reads the locked amount straight from the verified transaction, turns it into finite financing capacity, disburses real loans against it, and refuses on-chain any set of loans that would collectively exceed what the position is worth.

| Field | Value |
|---|---|
| Product | Notch |
| Track | BUIDL CTC 2026 Fall, DeFi (RWA is the narrative extension, not the technical claim) |
| Status | LOCK candidate. Mode D PRD. Features not cut. |
| Owner | Divine |
| Build window | Gated, not calendar-driven. Later gates start on a pass rule, not a date. |
| Headline metric | USDT of over-financing prevented on the frozen multi-lender set vs a per-lender-guard baseline |
| Sponsor directness | L5. The precompile verification gates capacity creation; nothing exists without a passing Attestcoin proof |
| Removal score | 5/5. Remove Attestcoin and there is no trustless basis for any capacity. The product is gone, not degraded |
| Determinism | Capacity and conservation are computed by a deterministic reference model. No model, no heuristic, chooses a number |

## 1. One sentence

Notch turns a proven Ethereum cashflow into finite Creditcoin financing capacity, disburses real loans against it, and guarantees on-chain that independent lenders can never collectively finance more than the position is worth.

### The name

A medieval debt was carved into a wooden tally stick, then split in two so the creditor and debtor each held a half that had to match. The same debt could never be forged or claimed twice. Notch rebuilds that instrument: a shared, on-chain record of what a real position has already been drawn down for, so it cannot be financed twice. The logo is a single V-notch cut into a solid block, the mark of one recorded draw.

## 2. Problem and user

### Exact user

A lender who wants to finance a borrower against a real, external cashflow, and needs to know that the same cashflow has not already been financed to its limit by someone they cannot see. And a borrower who holds a real locked cashflow on Ethereum and wants to finance against it on Creditcoin.

### Job

Originate a loan against a real external position, and be certain the position has residual capacity left — without trusting the borrower's word or a centralized registry.

### Break

- Double financing is a documented, multi-billion-dollar fraud: the same future income is pledged to lenders who cannot see each other, and both extend credit against money that covers one.
- The proof that a position exists is reusable. Two lenders can each independently verify the same true fact and each finance the full amount. Each is individually correct; together they are wrong.
- Existing fixes are centralized registries that require trusting a middleman with the shared consumption state.
- A borrower can assert the collateral is worth more than it is, because most systems take the amount as input.

### Workaround today

Independent underwriting per lender, no shared consumption state, and after-the-fact discovery of the fraud when the money does not cover the claims.

## 3. Lock

### Dominant mechanism

Real Ethereum cashflow creation transaction → Attestcoin inclusion proof → on-chain precompile verification → receipt status success check → deterministic decode of the lockup event (deposit, recipient, token, lock parameters) from verified `txBytes` → finite capacity instantiated on Creditcoin from the decoded event deposit after fees → lender-funded loan disbursed atomically with capacity consumption → any financing that would exceed capacity refused on-chain → a receipt a third party recomputes from recorded inputs and from Creditcoin storage.

### Falsifiable claim

Given a real Sablier non-cancellable timelock creation transaction on Ethereum Sepolia, its Attestcoin inclusion proof, and the CC3 Testnet contracts, Notch verifies the proof through the BlockProver precompile, requires the transaction receipt status to be success, decodes the lockup event deposit and lock parameters from the verified transaction bytes without any user-supplied amount, instantiates a financing capacity equal to that decoded deposit after broker fees, disburses real ccUSD from lender to borrower atomically with capacity consumption, refuses on-chain any financing whose running sum would exceed capacity, preserves conservation and idempotency, and exposes a receipt that a third party can recompute from recorded inputs and from Creditcoin storage, such that on the frozen multi-lender set the total financed against any single position never exceeds its attested capacity.

### Competitive hypothesis

This season already contains the crowded shape: prove an Ethereum fact, then make a lending or scoring decision. Attestcoin Tutorial 4 is a cross-chain loan dApp; CrossCredit proves Aave repayments and lends; CreditX proves Ethereum history, mints a score, and lends; the season-1 runner-up HashCredit proved an external income stream and originated a loan. Those designs treat the proven fact as reusable information, proved once and read by one or more decision systems. Under the same positions, lenders, and amounts, sharing one conserved capacity derived from an attested position instead of each lender keeping its own replay guard changes the total financed against a position, because independent per-lender guards cannot see each other and therefore permit collective over-allocation that a shared conserved capacity refuses. A read-and-decide design cannot represent how much is left after someone else already spent against this exact position.

### Falsifiers

- The BlockProver precompile output and the Decoder contract cannot decode the Sablier deposit and `unlockAmounts` from the proven transaction on-chain. Then capacity-from-proof is `BLOCKED`, must be named, and the lock narrows or fails. It must not be replaced by a user-supplied number.
- On the frozen multi-lender set, `no_conservation` (per-lender guard) does not over-finance more than `full`. Then the mechanism prevents nothing measurable and is not proven.
- Capacity can be instantiated without a passing proof, or from a user-supplied amount. Then the removal score is false.
- The inclusion proof admits a reverted Sablier create and instantiates capacity because the receipt status is not checked.
- Decode uses `totalAmount` and disagrees with the Sablier deposit event, so capacity is over-stated by the broker fee.
- Lender B succeeds when requesting more than remains, or Lender A and Lender B are the same key.
- The demo makes "a loan happened" the whole story, so Notch collapses into the crowded prove-then-lend shape (Tutorial 4, CrossCredit, CreditX). Mitigation: the two-lender collision plus the typed-amount ablation must be visible.
- Receipts cannot be recomputed from recorded proof inputs or from Creditcoin storage.
- A silent fallback to a self-minted Sepolia event or a simulated proof is used while the UI claims a real Attestcoin-verified source.

## 4. Scope rule

This PRD is the full Notch system. Do not delete a listed feature to make a fake V1. Implement in gates so the live core exists first. A feature may be marked `BLOCKED_BY_ATTESTCOIN` with a named failing call. It may not be quietly dropped, and a blocked capability may not be simulated while the UI claims it is live.

## 5. Actors and permissions

| Actor | Can do | Cannot do |
|---|---|---|
| Borrower | Present a real Ethereum cashflow, receive ccUSD when a loan is originated | Set the capacity, assert the amount, re-instantiate a spent claim |
| Lender | Verify a cashflow, finance against available capacity, read receipts | Finance past available capacity, mutate capacity except through a loan |
| Notch process | Verify proofs, decode `txBytes`, instantiate claims, consume capacity, move ccUSD lender to borrower, write ledger | Create capacity without a passing proof, accept a user-supplied amount, split consume and transfer |
| Judge / public | Open demo, read receipts, rerun the verifier on recorded inputs, follow explorer links | See unpublished balances or private keys |
| Attestcoin / Creditcoin | Attest source blocks, verify inclusion, execute the state change | Choose the capacity or the winner |

Trust assumption: Attestcoin attestors and the Creditcoin matching are source of truth for source-chain inclusion and on-chain state. Sablier is source of truth that the deposited tokens are locked. Notch is source of truth for capacity math and conservation. No user input and no model is ever source of truth for the amount.

## 6. User journeys

### J1. Verify and finance
1. A lender points Notch at a real Sablier creation transaction on Sepolia.
2. Notch obtains the Attestcoin proof, verifies it on-chain, decodes the deposit, instantiates capacity. The amount appears from the proof; no one types it.
3. The lender finances part of the capacity. ccUSD moves lender to borrower atomically; available capacity falls.
4. The receipt records the proof hash, decoded capacity, the loan, and the verify command.

### J2. Second lender refused
An independent lender attempts to finance past the remaining capacity of the same position. The transaction reverts with `InsufficientFinancingCapacity`. The refusal is a calm ledger line, not a crash.

### J3. Fake source refused
A lender points Notch at a fabricated or unproven stream. `instantiateClaim` reverts because the proof does not verify. No capacity is created. The strip test is visible.

### J4. Draw to exhaustion
Multiple lenders finance the same position in parts until available reaches zero. The next financing of any positive amount reverts. Sum financed equals capacity exactly, within dust.

### J5. Timeout is not a double disbursement
An RPC or proof call times out mid-flow. Notch queries state by the deterministic receipt key before any retry. A duplicate disbursement is a defect.

### J6. Judge replay
A visitor opens the proof page, picks a receipt, sees the recorded proof inputs, the decoded capacity, the financing history, and a local recompute that matches or flags drift.

## 7. Feature inventory

Nothing here is optional flavor. If Attestcoin cannot support a step, the UI names it `BLOCKED_BY_ATTESTCOIN` with the failing call, and the lock narrows honestly.

### 7.1 Verify layer
- Input a Sablier creation transaction (hash + stream id) on Ethereum Sepolia.
- Obtain the Attestcoin inclusion proof from the ProofBuilder HTTP API by `fetch`. No SDK, no ethers.
- Submit the proof to the BlockProver precompile on Creditcoin for on-chain verification.
- Decode the receipt from the verified encoded transaction and require `receiptStatus == 1`. Inclusion of a reverted transaction creates no capacity.
- Decode the lockup event (preferred) via the Decoder contract, and map its fields onto the claim. Calldata fields are an authenticated fallback only if logs are absent from `txBytes` on CC3, and the README states which path was used. Do not pretend logs were decoded.
- Provenance on every input: chain key, header number, tx hash, and the hash of the raw proof payload.

### 7.2 Source shape enforcement
Source: Sablier Lockup **v4.0** (release March 2026, non-upgradeable), unified `SablierLockup` contract, created via `createWithTimestampsLL` (Lockup Linear). Sepolia address to allowlist: **`0xe61cb9153356419bdaD0A8767c059f92d221a3C4`**. Decoded fields come from the shared struct `Lockup.CreateWithTimestamps { sender, recipient, depositAmount, token, cancelable, transferable }` plus `LockupLinear.UnlockAmounts { start, cliff }` and the cliff/end timestamps. Note: v4.0 uses `depositAmount` (older releases used `totalAmount`); v2.0 and v3.0 are outdated.

Broker-fee honesty: capacity is the decoded event `depositAmount` (what is locked, net of protocol/broker fees), never `totalAmount` (what was paid in). If the two diverge, the event deposit wins. Using `totalAmount` over-states capacity and is a falsifier.

Instantiation requires all of these, decoded from the verified `txBytes` of a receipt-success transaction, or it reverts:
- source contract equals the allowlisted Sablier Lockup on Sepolia (`0xe61cb9153356419bdaD0A8767c059f92d221a3C4`)
- `depositAmount > 0` (event value, after fees)
- `token` equals the approved demo asset
- `cancelable == false`
- `unlockAmounts.start == 0`
- `unlockAmounts.cliff == 0`
- cliff timestamp `T > block.timestamp`

### 7.3 Capacity layer
- `originalCapacity` equals the decoded `depositAmount`. Never a user input.
- `available = originalCapacity - financedCapacity`.
- `claimId = keccak256(sourceChainKey, sourceTxHash, streamId)`. A second instantiation of the same claim reverts.

### 7.4 Lending and execution
- `finance(claimId, amount)` is one atomic transaction: consume capacity, then move ccUSD lender to borrower, then emit the loan event. A failed transfer reverts the capacity change.
- Order is fixed: consume first so an over-request reverts before any transfer.
- Any address may act as a lender. Conservation holds across all of them.

### 7.5 Recovery and idempotency
- Deterministic receipt key per loan. Query state before any retry.
- Append-only ledger. On restart, resume any open receipt.

### 7.6 Policy and safety
- `max_notional` per claim optional.
- No withdrawal or outbound-write capability is bound in the process.
- Capacity can only fall through an originated loan (`onlyVenue` on `consume`).

### 7.7 Ledger, receipts, proof
- Append-only JSONL ledger.
- Canonical hash over the proof inputs and the capacity math, not over prose.
- Verifier CLI: `notch verify RECEIPT_ID` reads recorded inputs, reruns the reference model, prints `MATCH` or `DRIFT`.
- Public `/verify` view or snippet that recomputes `available` for a claim from Creditcoin storage, without the app, using the README recipe.
- No silent deletion of losing or blocked runs.

### 7.8 UI
- Surface A Verify. Input, then decoded facts and a source-tx explorer link.
- Surface B Position. Capacity figure, capacity bar that cuts a notch per draw, finance action, latest loan settled with an explorer link.
- Surface C Activity. Loans and the refused draw, both first-class.
- Empty, loading, pending-attestation, proof-failed, and insufficient-capacity states are first-class.
- Winning screenshot: one position, capacity 100k to 30k, a settled loan, a refused draw, three explorer links.

### 7.9 Distribution and repo
- Public web app for the judge path, CLI for verify and campaign.
- README leads with the over-financing-prevented result.
- This PRD is the single source of truth for product, contracts, integration, frontend, and demo. Runtime logs go in `DECISIONS.md`, `GATES.md`, and `CLAIMS.md`.

## 8. Claim schema

| Field | Type | Rules |
|---|---|---|
| `claimId` | bytes32 | `keccak256(sourceChainKey, sourceTxHash, streamId)` |
| `sourceChainKey` | uint32 | 1 = Ethereum Sepolia |
| `sourceTxHash` | bytes32 | Sablier creation tx |
| `sourceContract` | address | Allowlisted Sablier Lockup |
| `streamId` | uint256 | Sablier stream id |
| `borrower` | address | Decoded recipient |
| `asset` | address | Decoded token |
| `originalCapacity` | uint128 | Decoded `depositAmount`. Never user input |
| `financedCapacity` | uint128 | Running sum of loans |
| `lockedUntil` | uint40 | Decoded cliff `T`. Must be `> now` at instantiation |
| `active` | bool | |

`available = originalCapacity - financedCapacity`.

## 9. Receipt schema

| Field | Meaning |
|---|---|
| `receipt_id` | ulid |
| `mode` | `PAPER` \| `LIVE` |
| `claim` | Frozen claim, including decoded capacity and lock params |
| `proof_inputs` | chainKey, headerNumber, txHash, hash of raw proof payload |
| `capacity_before` | Available before this loan |
| `lender` | Address |
| `amount` | ccUSD financed |
| `capacity_after` | Available after |
| `fill` | On-chain tx id of the disbursement |
| `refused` | true with `reason_code` if this receipt records a refusal |
| `verify_command` | `notch verify {id}` |
| `limitations` | Plain text, required if any step was blocked |

## 10. State machines

### Claim
`UNVERIFIED → PROOF_SUBMITTED → VERIFIED → INSTANTIATED (AVAILABLE) → PARTIALLY_FINANCED → EXHAUSTED`
Side door: `REJECTED` (proof failed or shape check failed) creates nothing.

### Finance leg
`READY → CONSUME_OK → TRANSFERRED → RECEIPTED`
Side doors: `INSUFFICIENT_CAPACITY` (revert, no transfer), `TRANSFER_FAILED` (revert, capacity restored atomically).

### Proof leg
`NEED_ATTESTATION → ATTESTED → PROOF_FETCHED → VERIFIED | VERIFY_FAILED`
Attestation is polled, not slept.

## 11. Invariants

1. Capacity is decoded from a precompile-verified transaction whose receipt status is success. No user input, no model, sets it.
2. Capacity equals the decoded event `depositAmount` after fees, never `totalAmount`.
3. For any claim `c`, `sum(finance(c, amount)) <= originalCapacity(c)`.
4. Consume and transfer are one atomic transaction. Neither happens without the other.
5. A claim is instantiated at most once. Re-instantiation reverts.
6. A blocked Attestcoin capability is named. The product does not substitute a self-minted source and keep the "verified" label.
7. Capacity falls only through an originated loan.
8. `PAPER` receipts never add into `LIVE` totals.
9. No withdrawal or outbound-write capability is bound.
10. Receipt hash covers proof inputs and capacity math, not prose.
11. The refusal of an over-draw is on-chain and recomputable from Creditcoin storage, not a UI check.
12. The two demo lenders are distinct funded wallets. One key acting as both is a hard fail.

## 12. Attestcoin protocol seam

| Need | Source of truth | Fail closed if missing |
|---|---|---|
| Source block attestation | Attestcoin attestors | Yes |
| Inclusion proof | ProofBuilder API | Yes |
| On-chain verification | BlockProver precompile `0x..0FD2` | Yes |
| Receipt status success | Decoded receipt from verified tx; require `receiptStatus == 1` | Reverted tx creates no capacity |
| `txBytes` decode of deposit and `unlockAmounts` | Precompile output and Decoder contract `0x731c...` (event preferred, calldata fallback) | Capacity-from-proof `BLOCKED`; narrow the lock |
| Source chain support | ChainInfo precompile `0x..0fd3`. Docs use Sepolia = key `1`; confirm against ChainInfo, do not assume | Yes |
| Outbound write to Ethereum | Not released | Out of the v1 path. Repayment is v2 |

Seam spike is Gate 1. Before any UI, run a script that reads the live Sepolia ABI, creates a Sablier timelock, fetches its proof, verifies it on-chain, checks receipt status, and decodes the deposit and `unlockAmounts` from the verified transaction. Record the event `depositAmount` and confirm the three numbers (tx hash, stream id, deposit) survive decode on Creditcoin. Commit the evidence with secrets stripped. If the decode does not work, the core thesis is blocked and the design is reworked before anything else is built. Do not code the production decoder against a blog ABI if the live contract differs.

## 13. Architecture

Single repo.
- `core/` reference model: capacity decode and conservation, deterministic, no network.
- `contracts/` `MockUSDC`, `AttestedCashflowRegistry`, `CashflowLendingVenue`.
- `adapter/` ProofBuilder HTTP client by `fetch`, precompile calls by viem, raw payload store.
- `web/` Surfaces A to C.
- `cli/` verify, campaign.
- `data/` `ledger.jsonl`, `receipts/`, `campaign/`.

Language: TypeScript with wagmi/viem for web and adapter; Solidity for contracts. No ethers. Decision recorded in `DECISIONS.md` on day one and not reopened.

Original insight to record in `DECISIONS.md`: the naive design treats the proof as a fact to read and the amount as an input to trust. The insight is that the amount and the lock conditions are decoded from the verified transaction and become a scarce, conserved resource; the proof is not a signal feeding a decision, it is the source of the number.

## 14. Threat model

| Threat | What we do | Residual |
|---|---|---|
| Borrower inflates the amount | Amount decoded from the proof, never input | None |
| Two lenders finance the same position | Shared conserved capacity refuses the over-draw | Lenders outside Notch are not bound |
| Fake or unproven source | `verifySingle` gate plus source-contract allowlist | None within scope |
| Stream drainable before lock ends | `cancelable` false, `unlockAmounts` zero, future cliff | None within the chosen shape |
| Included-but-reverted create | Success check if receipt proof available, else documented | Documented boundary |
| Recycled capital mints two claims | Scarcity is per position transaction; documented | Per-tx, not per-dollar |
| Silent fallback to mock or self-minted source | No fallback rule; source-contract allowlist | Owner ops discipline |
| Double disbursement on timeout | Query before retry, atomic finance | Chain-side races outside our view |

## 15. Public / private boundary

| Item | Boundary |
|---|---|
| Capacity math, claim ids, reason codes | Public |
| Recorded proof inputs for published receipts | Public at submission |
| On-chain fill ids for published loans | Public at submission |
| Campaign aggregates and ablation | Public |
| Private keys, RPC secrets | Private forever |
| Unpublished balances | Private until a receipt is published |

## 16. Reference model spec

File: `core/reference_model.md` plus an executable `instantiate(proof) -> Claim` and `apply(loan, claim) -> Claim`.
- Inputs are pure JSON. No clock calls inside; `received_at` and `now_at_instantiation` are input fields.
- Capacity equals the decoded deposit. The decoder is specified against the deployed Sablier ABI.
- Conservation: `available` never negative; a loan exceeding `available` is rejected by the model, matching the contract revert.
- Fixtures: zero amount, exact remainder, remainder+1, two-lender race, replay of the same source tx, wrong chain key, failed receipt (status 0), cancelable stream, non-zero start or cliff unlock, past cliff, wrong source contract, broker-fee `totalAmount` vs event `depositAmount`, inactive claim, unauthorized venue, fake merkle proof, missing precompile.
- The production contract must match the reference on the fixture pack.

## 17. Verification campaign

### Headline

USDT of over-financing prevented on the frozen multi-lender set, versus a per-lender-guard baseline. Show the total financed under `full` (shared conservation) and under `no_conservation`, on the same positions and lenders.

### Frozen set, lock before looking

- Positions: at least 5 real Sablier timelocks on Sepolia, varied deposits.
- Lenders: at least 3 independent addresses per position.
- Scenarios per position: sequential draws to exhaustion, a race of two lenders on the residual, a fake-source attempt, a re-instantiation attempt.
- Minimum 20 completed runs that reach a receipt. Publish every attempt, including refusals and blocked runs.

### Ablations

- `full` (shared conserved capacity)
- `no_conservation` (each lender keeps its own replay guard, sees only its own state)
- `single_lender_guard` (replay protection only, no residual accounting)
- `user_supplied_amount` (capacity typed, not decoded) — must fail the strip test

Hold positions, lenders, and amounts fixed. If `full` does not prevent over-financing that `no_conservation` allows, the mechanism is not proven.

### Epistemic attacks to run

- Cherry-pick: publish the full set, not the best runs.
- Crippled baseline: the baseline uses the same positions and the same proofs.
- Hidden retry: the campaign runner records attempt count.
- Fabrication: every capacity number traces to a decoded, verified transaction.

## 18. UX copy and demo

### 10 second line

You point Notch at a real Ethereum cashflow. It proves it with Attestcoin, reads the locked amount from the transaction itself, and lets lenders finance it once, never twice.

### Winning screenshot

One position. Capacity 100,000 to 30,000. A settled loan to the borrower. A refused second draw. A source hash, an instantiate tx, a finance tx, all linkable.

### Three-minute demo, written before build

1. 0:00 to 0:12. One-sentence problem, scoped: lenders who share no book will over-finance the same lock. Then the product.
2. 0:12 to 0:27. Real Sablier source on Sepolia, explorer link.
3. 0:27 to 0:42. Attestcoin verifies; receipt status is checked; capacity appears from the decoded event deposit; a fake or failed source is refused briefly.
4. 0:42 to 1:05. Lender A (a funded wallet) finances 70,000; borrower balance jumps; capacity falls to 30,000; finance tx link. Hero.
5. 1:05 to 1:15. Lender B (a different funded wallet) requests 50,000; refused with `InsufficientFinancingCapacity` as a ledger line.
6. 1:15 to 1:30. Recap frame; the scoped guarantee and the bypass boundary in one line; the typed-amount control shown to disagree with the decoder; verify command shown. Stop.

Everything on screen is a real transaction or a real revert. No mocked balances. One key acting as both lenders is a hard fail.

## 19. Non-goals

Out of Notch, not deferred.
- Repayment waterfall and paying lenders from the Ethereum cashflow.
- Default handling, liquidation, borrower bonds, seniority or ordering adjudication.
- Reverted-transaction proofs as a product.
- Outbound Attestcoin writes.
- Binding lenders who never integrate Notch.
- Multi-source generality across many tracks in one submission.
- Any second product surface.

## 20. Phased gates

Build in this order. A later gate starts on a pass rule, not a date.

### Gate 0. Repo and contract
Scope: `BUILD_CONTRACT.md`, folder layout, `paper_only` true, dummy reference test green.

### Gate 1. Decode seam (make or break)
Scope: read the live Sepolia ABI at `0xe61cb9153356419bdaD0A8767c059f92d221a3C4`; create a Sablier non-cancellable timelock via `createWithTimestampsLL` (`cancelable=false`, `unlockAmounts.start=0`, `unlockAmounts.cliff=0`, future cliff); record tx hash, stream id, and event `depositAmount`; fetch its Attestcoin proof; verify on-chain via the precompile; check `receiptStatus == 1`; decode `depositAmount` (event value, after fees) and `unlockAmounts` from the verified transaction, on-chain or via the Decoder contract.
Evidence: committed script output, raw payloads with secrets stripped, the decoded fields.
Pass: capacity decoded from a real verified transaction, matching the on-chain Sablier stream.
Stop: do not design screens. If decode fails, mark `BLOCKED_BY_ATTESTCOIN` and rework the source or the decode before anything else.

### Gate 2. Reference model
Scope: `instantiate` and `apply` plus the fixture pack.
Pass: all fixtures match golden files; over-draw and re-instantiation rejected.

### Gate 3. Registry and venue
Scope: `AttestedCashflowRegistry` with the proof gate and shape checks; `CashflowLendingVenue.finance` atomic.
Pass: instantiation from the real Sepolia tx; two-lender conservation on-chain; fake source refused.

### Gate 4. Paper receipts on live proofs
Scope: J1 to J4 in paper mode on live proofs; write receipts.
Pass: 10 paper receipts verify; mode label everywhere.

### Gate 5. Recovery
Scope: query-before-retry, restart resume.
Pass: injected timeout creates no second disbursement; restart resumes an open receipt.

### Gate 6. Live micro loans
Scope: funded addresses, tiny ccUSD, at least two independent lenders, one refused over-draw.
Pass: 5 live receipts with on-chain fill ids; conservation holds within dust.

### Gate 7. Campaign and ablation
Scope: frozen set runner, the four ablations, published refusals and blocked runs.
Pass: at least 20 receipted runs; `full` prevents over-financing that `no_conservation` allows; headline has a denominator.

### Gate 8. UI A to C
Scope: all surfaces, including pending-attestation, proof-failed, and insufficient-capacity states.
Pass: a judge finishes J6 without a terminal; the screenshot matches the winning concept.

### Gate 9. Submission freeze
Scope: README result table, `CLAIMS.md`, three-minute video, public proof page, co-design question posted.
Pass: every public sentence maps to a receipt or a named limitation. No new features after freeze.

## 21. Acceptance criteria

1. A judge understands the product from the position surface without a narrator.
2. A published receipt recomputes in the CLI, and remaining capacity recomputes from Creditcoin storage via the README recipe.
3. Every capacity number traces to a decoded, verified transaction whose receipt status was success; none is user input; capacity equals the event deposit after fees, not `totalAmount`.
4. A second, distinct funded lender's over-draw is refused on-chain with `InsufficientFinancingCapacity` and recorded. Lender A and Lender B are different keys.
5. A fake, failed, or wrong-shape source creates no capacity, and re-instantiation of the same source reverts.
6. A typed-amount control on the same source is shown to disagree with the decoder and is not callable on the production path.
7. Timeout never double-disburses.
8. The campaign includes refusals and blocked runs, and the headline has a denominator.
9. Three explorer links resolve live (source, instantiate, finance).
10. README leads with the over-financing-prevented result, not a tool count.

## 22. Build contract excerpt

- Evidence may correct this PRD. Record it in `DECISIONS.md`. Do not silently shrink claims.
- Do not fabricate proofs, capacities, fills, or savings.
- Numbers need a file and a denominator.
- No silent fallback from a real Attestcoin-verified source to a self-minted or simulated one.
- Capacity is decoded from a verified transaction, never supplied.
- After Gate 7, freeze the capacity and conservation math unless a bug produces a wrong number.

## 23. Open questions that do not block Gate 1

- Whether receipt or log proof is available to add an explicit success check for the create. If not, document the inclusion-not-success boundary.
- Sablier Lockup v4.0 Sepolia address is pinned: `0xe61cb9153356419bdaD0A8767c059f92d221a3C4`. What remains for Gate 1 is confirming the exact `createWithTimestampsLL` calldata byte-layout (struct + `unlockAmounts`) against the deployed contract and that it decodes from the proven `txBytes` on-chain.
- Hosting target for the public proof page. Pick before Gate 8. Must not require the owner's laptop.
- The co-design question to the Creditcoin team on establishing freshness under the inclusion-only model.

## 24. Glossary

| Term | Meaning here |
|---|---|
| Claim | A verified external cashflow position with a finite capacity on Creditcoin |
| Capacity | The decoded deposit amount; the ceiling on total financing for a claim |
| Conservation | The invariant that total financing never exceeds capacity |
| Available | Capacity minus financed |
| Baseline | Per-lender guard: each lender sees only its own state |
| Receipt | Recomputable record of proof inputs, capacity, and a loan |
| ccUSD | The demo lending asset on Creditcoin |
| Paper | Live proofs, simulated disbursement, labeled, excluded from live totals |

## Appendix C — Contracts (full)

Three contracts plus the test asset. Solidity on Creditcoin CC3 Testnet.

### MockUSDC (ccUSD)
Standard ERC-20, 6 decimals, open `mint(address,uint256)` for the demo. The asset that moves lender to borrower.

### AttestedCashflowRegistry
Owns claims and capacity. Verifies proofs, decodes, instantiates, and mutates capacity (only via the venue).

```solidity
struct Claim {
    bytes32 claimId;          // keccak256(sourceChainKey, sourceTxHash, streamId)
    uint32  sourceChainKey;   // 1 = Ethereum Sepolia
    bytes32 sourceTxHash;     // Sablier creation tx
    address sourceContract;   // allowlisted SablierLockup v4.0 (Sepolia 0xe61cb915...a3C4)
    uint256 streamId;         // Sablier stream id
    address borrower;         // decoded recipient
    address asset;            // decoded token
    uint128 originalCapacity; // decoded depositAmount; never user input
    uint128 financedCapacity; // running sum of loans
    uint40  lockedUntil;      // decoded cliff T; must be > now at instantiation
    bool    active;
}

mapping(bytes32 => Claim) public claims;

function instantiateClaim(
    uint32 chainKey, uint64 headerNumber,
    bytes calldata txBytes, bytes calldata merkleProof, bytes calldata continuityProof
) external returns (bytes32 claimId);
// 1. BlockProver.verify(...) -> require(verified)                          [FAIL CLOSED #2]
// 2. decode receipt from verified tx -> require(receiptStatus == 1)        [FAIL CLOSED #3]
// 3. decode the lockup event (preferred; calldata fallback if logs absent):
//    recipient, depositAmount (event value, after fees, NOT totalAmount), token,
//    cancelable, unlockAmounts.start, unlockAmounts.cliff, cliffTime, endTime, streamId
// 4. require(sourceContract == allowlisted SablierLockup)
// 5. require(cancelable == false)
// 6. require(depositAmount > 0)
// 7. require(token == approvedDemoAsset)
// 8. require(unlockAmounts.start == 0 && unlockAmounts.cliff == 0)
// 9. require(cliffTime > block.timestamp)
// 10. claimId = keccak256(chainKey, txHash, streamId); require(!claims[claimId].active)
// 11. store claim; originalCapacity = depositAmount; financedCapacity = 0; active = true

function available(bytes32 claimId) public view returns (uint128); // original - financed
function borrowerOf(bytes32 claimId) external view returns (address);

function consume(bytes32 claimId, uint128 amount) external onlyVenue;
// require(claims[claimId].active)
// require(amount <= available(claimId))                                     [conservation]
// financedCapacity += amount
```

### CashflowLendingVenue
One atomic product transaction.

```solidity
function finance(bytes32 claimId, uint128 amount) external {
    registry.consume(claimId, amount);                 // reverts on inactive/insufficient [FAIL CLOSED #1]
    address borrower = registry.borrowerOf(claimId);
    ccUSD.transferFrom(msg.sender, borrower, amount);  // lender -> borrower
    emit LoanOriginated(claimId, msg.sender, borrower, amount, registry.available(claimId));
}
```

Order: consume first (an over-request reverts before any transfer); one transaction, atomic; a failed transfer reverts the capacity mutation. `msg.sender` is the lender; any address may call, so conservation holds across independent lenders.

## Appendix D — Attestcoin endpoints and addresses (CC3 Testnet)

- RPC: `https://rpc.cc3-testnet.creditcoin.network`
- BlockProver precompile: `0x0000000000000000000000000000000000000FD2`
- ChainInfo precompile: `0x0000000000000000000000000000000000000fd3`
- Decoder contract: `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f`
- ProofBuilder API: `https://proof-gen-api.cc3-testnet.creditcoin.network`
- Prover: `https://prover.cc3-testnet.creditcoin.network`
- Source chain key: docs and examples use Ethereum Sepolia = `1` (Ethereum Mainnet = `3`). Confirm against the ChainInfo precompile before coding; do not assume it.

**Flow (no SDK, no ethers):** Sablier creation tx -> poll ProofBuilder API by `fetch` until attested, request proof `{ chainKey, headerNumber, txHash, txBytes, merkleProof, continuityProof }` -> submit to `instantiateClaim`, which does the following on-chain via viem-submitted calldata:
1. verify on the BlockProver precompile;
2. decode the receipt from the verified encoded transaction and `require(receiptStatus == 1)`;
3. decode the Sablier lockup event by its live signature and map fields onto the claim; if logs are unexpectedly absent from `txBytes` on CC3, fall back only to calldata fields that the successful receipt still authenticates, record the boundary in `GATES.md`, and say so in the README — never pretend logs were decoded;
4. enforce the source shape and store the claim.

The `@gluwa/usc-sdk` requires ethers v6, so it is not used at runtime; proofs are fetched over HTTP and submitted with viem. The SDK may be read only as an encoding reference. Note: exact Decoder method names and the BlockProver verify entrypoint (`verify` / `verifyAndEmit`, receipt/log decode helpers) are not assumed here — confirm them against the deployed Decoder ABI during the Gate 1 seam spike before writing the production decoder.

**Known boundary:** the precompile proves inclusion, not success or current state. If receipt/log proof is available via the Decoder contract, add an explicit success check; otherwise document it and use a real successful creation tx. Attestcoin is read-only (Ethereum to Creditcoin); outbound writability is unreleased, so repayment is v2.

## Appendix E — Frontend spec and copy

Stack: Next.js 16.2 `--webpack` (never Turbopack), TypeScript strict, Tailwind, wagmi/viem (never ethers), lucide-react for every icon. No literal emoji anywhere — UI, copy, toasts, logs.

**Design tokens** (deliberately not the cream-and-terracotta default; boldness spent only on the notch and the refused state):
- `--bone` `#EEE9DE` base surface; `--ink` `#17150F` text and filled capacity; `--ink-soft` `#6B6558` secondary; `--line` `#D8D0C0` hairlines; `--cut` `#B23A2E` the one accent (logo notch and the refused state only); `--settled` `#2E5D3A` used once for the settled mark.
- Type: Fraunces (carved serif) for display and the big capacity figure; Inter for UI and all numerals with `tabular-nums`. The capacity figure is the largest type and the thing that moves.
- Signature element: a capacity bar that cuts a notch on each draw. Motion is for one moment: on settle, advance the fill and cut the notch, once. Respect `prefers-reduced-motion`.
- Logo: `notch-logo.svg`, a V cut into a solid block, `currentColor`.

**Three surfaces:** A Verify (input a Sablier tx hash + stream id, then decoded facts and a source-tx explorer link; capacity appears from the proof, never typed). B Position (capacity figure, capacity bar, finance action, latest loan settled with an explorer link — the money-shot). C Activity (loans and the refused draw, both first-class). Empty, loading, pending-attestation, proof-failed, and insufficient-capacity states are first-class.

**Copy (verbatim, sentence case, active voice):**
- Product name `Notch`; tagline `Finance real cashflows across chains. Never twice.`
- Verify: heading `Import a cashflow`; fields `Sablier creation transaction`, `Stream id`; button `Verify with Attestcoin`; pending `Verifying on Ethereum Sepolia`; verified `Verified on Ethereum Sepolia`; decoded rows `Locked amount`, `Recipient`, `Cancelable` -> `No`, `Locked until`, `Source` -> `Ethereum Sepolia` with `View transaction`; reassurance `Notch did not take your word for the amount. It read 100,000 from the verified transaction.`
- Position: big figure = available; label `available of 100,000 financing capacity`; secondary `70,000 financed`; button `Finance cashflow`; field `Amount to finance`; pending `Financing`; success toast `Financed 70,000 ccUSD to the borrower`; latest loan `Lender A financed the borrower`, `70,000 ccUSD`, `Settled on Creditcoin` (uses `--settled`), `View transaction`.
- Activity: heading `Activity`; blocked item (uses `--cut`, calm, not an error toast) primary `Draw refused`, detail `Only 30,000 of capacity remains against this position. Requested 50,000.`
- Empty `No loans yet. Verify a cashflow to open financing.`; proof failed `This position could not be verified on Ethereum. Notch creates no capacity without a valid Attestcoin proof.`; no wallet `Connect a wallet to act as a lender.`
- Never write "Submit", "Something went wrong", or any apology. The button says `Finance cashflow`; the success says `Financed` — same verb.

**Money-shot frame:** one position; `Verified on Ethereum Sepolia` with source hash; `30,000 available of 100,000`; capacity bar showing the notch; `Lender A financed the borrower 70,000 ccUSD — Settled on Creditcoin`; activity line `Draw refused — only 30,000 remains. Requested 50,000.`; three explorer links (source, instantiate, finance). Everything real.

**Landing page is required (user correction, September 11, 2026):** `/` explains Notch and links to a preloaded, usable `/verify` demo. Include this explicitly in every frontend build/handoff. See `AGENTS.md` and RULES F12–F13.

**Do not:** emoji; ethers; unrequested extra screens; `->` on buttons; ALL-CAPS eyebrows; middle-dot decoration; a crash-styled refusal.

## Appendix F — Pinned addresses

**Sablier Lockup v4.0 on Ethereum Sepolia** (release March 2026, final, non-upgradeable, verified on Etherscan). Create via `createWithTimestampsLL`; struct `Lockup.CreateWithTimestamps { sender, recipient, depositAmount, token, cancelable, transferable }` + `LockupLinear.UnlockAmounts { start, cliff }` + cliff/end timestamps. v4.0 uses `depositAmount` (older releases used `totalAmount`); v2.0 and v3.0 are outdated.

| Contract | Sepolia address |
|---|---|
| SablierLockup (allowlist this) | `0xe61cb9153356419bdaD0A8767c059f92d221a3C4` |
| SablierBatchLockup | `0xd4ddc49F9D03a48293b5c8d89Cc210Af49d03D72` |
| LockupHelpers | `0xC86B56250D2758f30d09B3420D9ec5b646244C7c` |
| LockupMath | `0x6c873BcE27aA6Ca803EF7013F05d1802AB6995b6` |
| LockupNFTDescriptor | `0x955dC7A2170782344FA9Ac11De0C0C42C05De2Fc` |

Attestcoin CC3 Testnet addresses are in Appendix D.

End of Notch Mini PRD v1.0. Feature inventory in section 7 is the source of truth. Gates in section 20 are the build order. Non-goals in section 19 are the only allowed cuts. Appendices C to F are the full contract, integration, frontend, and address detail — this PRD is self-contained.
