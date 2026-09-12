# Rules — things that must never happen

A testing checklist, not a design doc. Each rule is something that should be actively
tried and confirmed to fail (revert, refuse, or visibly refuse to render), not just
assumed true by reading the code. Every rule traces back to `Notch-PRD.md`, `DECISIONS.md`,
or a real bug found in Gates 1–5 — the source is named so you can go read the reasoning,
not just the rule.

How to use this: for each row, do the thing in the "must never happen" column on purpose,
against real infrastructure where the row says so, and confirm the system refuses. If it
doesn't refuse, that's a bug, full stop — not an edge case to note and move past.

## Backend — contracts (`AttestedCashflowRegistry`, `CashflowLendingVenue`)

| # | Must never happen | How to try it | Source |
|---|---|---|---|
| B1 | A claim is created from a user-typed amount | Call `instantiateClaim` with any path that lets a number be supplied directly rather than decoded from `txBytes` | PRD invariant 1; "capacity decoded, never typed" is the load-bearing property |
| B2 | Capacity is created without a passing BlockProver proof | Submit `instantiateClaim` with a corrupted merkle sibling or wrong `chainKey` | PRD invariant 1; Gate 4 J3a |
| B3 | Capacity is created from a reverted (but included) source transaction | Submit a proof of a real Sepolia tx with `receiptStatus == 0` | PRD invariant 1; Gate 3/4, real reverted tx tested |
| B4 | Capacity is created from `totalAmount` instead of the decoded event `depositAmount` | Inspect whether any code path reads a `totalAmount`-shaped field at all | PRD invariant 2; Gate 2 broker-fee fixture |
| B5 | The same source position is instantiated twice | Submit the identical proof to `instantiateClaim` a second time | PRD invariant 5; Gate 4 replay receipt |
| B6 | `sum(finance amounts) > originalCapacity` for any claim, ever | Two independent lenders draw against the same claim until the sum would exceed capacity | PRD invariant 3; Gate 3/4 two-lender-race |
| B7 | A financing amount is accepted that doesn't convert to an exact ccUSD amount | Call `finance` with an amount that isn't a multiple of the deposit-to-ccUSD decimal scale (e.g. `1` wei of an 18-decimal asset) | `DECISIONS.md` D14/D23 — this is a **real bug that shipped once**: amount `1` consumed capacity while paying zero ccUSD |
| B8 | `financedCapacity` moves without a `ccUSD` transfer actually happening, or vice versa | Force a transfer failure (insufficient allowance) mid-`finance()` and check `available()` afterward | PRD invariant 3; "consume and transfer are one atomic transaction" |
| B9 | Anyone other than the venue can reduce `available()` | Call `registry.consume()` directly from an EOA, bypassing `CashflowLendingVenue` | PRD invariant 6; Gate 3 unauthorized-venue test |
| B10 | The registry's venue can be pointed at a different contract after deployment | Call `setVenue` (or any equivalent) post-deployment | `DECISIONS.md` D22/D23 — this was a **real bug**: the owner could reassign venue and consume directly, bypassing the loan-only guarantee. Now fixed by the registry deploying its own immutable venue — confirm no code path can still change it |
| B11 | A claim is financeable after its cliff has passed | Advance chain time past `lockedUntil`, then call `finance` | `DECISIONS.md` D23 (`ClaimExpired`) |
| B12 | A cancelable or transferable stream backs a claim | Submit a proof of a real stream with `cancelable=true` or `transferable=true` | PRD section 7.2; `DECISIONS.md` D23 (`TransferableNotAllowed`) |
| B13 | A non-allowlisted source contract, or the wrong chain, produces a claim | Submit a proof from a different contract or a tampered `chainKey` | PRD section 7.2; Gate 3 findings — note a wrong `chainKey` currently fails at proof verification, not the registry's own check (`DECISIONS.md` D13) — both must still refuse |
| B14 | The same logical `finance` action, retried, applies twice | Submit the same `(lender, actionKey)` pair to `finance` twice | `DECISIONS.md` D23 — on-chain idempotency via `actionKey`/`actionResults` |
| B15 | A zero-amount draw is accepted | Call `finance` with `amount = 0` | Gate 2 zero-amount fixture |
| B16 | The wrong stream is imported when a source tx contains multiple stream-creation events | Prove a tx with two `CreateLockupLinearStream` events and request the second one | `DECISIONS.md` D23 (`requestedStreamId`) |

## Backend — reference model and pipeline (`core/`, `adapter/`)

| # | Must never happen | How to try it | Source |
|---|---|---|---|
| B17 | `instantiate()` or `apply()` gives a different answer for the same input on a second call | Call either function twice with byte-identical input, diff the output | PRD section 16 determinism rules; `core/src/model.test.ts` |
| B18 | `instantiate()` or `apply()` reads the system clock, network, or any hidden state | Code review: grep for `Date.now()`, `fetch`, filesystem access inside `core/` | PRD section 16 — "no clock calls inside," "no network calls inside" |
| B19 | A stale Attestcoin proof is used without refetching | Hold a fetched proof for longer than `PROOF_STALENESS_LIMIT_MS` (15 min) and try to use it | `DECISIONS.md` D12/D18 — proofs observed to go stale within ~4.5 hours; refetch, never replay |
| B20 | A receipt's hash changes if you reorder its JSON keys, but doesn't change if the capacity math changes | Recompute `computeReceiptHash` on the same logical receipt with keys reordered (should match) and with `amount` changed (should not match) | `core/src/receipt.test.ts` |
| B21 | A receipt's hash is computed over `limitations`, `verify_command`, `recorded_at`, `receipt_id`, or `fill` | Change any of those fields on a receipt and confirm the hash is unaffected | PRD invariant 9 — "covers proof inputs and capacity math, not prose" |
| B22 | `notch verify` reports MATCH on a receipt whose `claim_after` or `capacity_after` has been tampered | Hand-edit a receipt JSON file, rerun `notch verify` | Gate 4 — proven with a real tamper test; must keep passing |
| B23 | A PAPER receipt's totals are added into any LIVE aggregate, anywhere | Check every place capacity/financing totals get summed for a `mode` filter | PRD invariant 7 |
| B24 | A refused or blocked run (fake proof, bad shape, timeout) is silently dropped instead of recorded | Trigger a refusal, check `data/ledger.jsonl` for the receipt | PRD section 7.7; Gate 9 pass rule |
| B25 | A retry after a crash produces a second real effect (double disbursement) | Kill the process between the state change and the receipt write, restart, check for exactly one effect | Gate 5 — this is the gate's entire purpose |
| B26 | A restart leaves a pending receipt neither finalized nor marked abandoned | Crash mid-flow, restart, inspect ledger state before any new work is accepted | Gate 5, PRD J5 |
| B27 | Two concurrent writers to the same store both succeed and corrupt the ledger | Run two processes against the same PAPER store simultaneously | Gate 5 concurrent-writer test |
| B28 | A test asserting "this must revert with error X" passes even when the actual revert reason is something else entirely | Check that revert-matching tests decode the *specific* named error, not just "something threw" | `DECISIONS.md` D23 — this happened for real: a test-harness ABI-decode gap let 4 tests report the wrong pass/fail signal in both directions until fixed |
| B29 | A receipt's `claim_before` for a concurrent action reflects submission-time state instead of true on-chain execution order | Fire two real `finance()` calls concurrently against the same residual (`Promise.allSettled`), then check the losing leg's receipt against the *winning* leg's already-applied state, not the shared starting snapshot both were submitted against | `DECISIONS.md` D24 — this happened for real in Gate 6: both legs landed in the same block, one at tx index 1 and the other at index 2; the loser's receipt initially recorded the pre-race snapshot as `claim_before`, which made `notch verify` correctly report DRIFT (the pure model, given that stale `claim_before`, said the loser's draw *should* have succeeded) until `claim_before` was corrected to the state after the winning leg's tx index had already applied |
| B30 | A receipt is built with a required field silently `undefined` because a hand-written object didn't set it, and no validator catches it before it's written to the ledger | Try constructing a `rulesVersion: 2` `Claim`/`Proof` with `attestedTxDigest` omitted and see whether anything rejects it before `appendReceipt` | `DECISIONS.md` D24 — `core/src/validate.ts`'s `validateClaim`/`validateProof` catch this today (that's *why* the Gate 6 receipts read DRIFT instead of silently recording wrong data), but the fix has to be in the receipt-building code, not in loosening the validator |
| B31 | A receipt's `reason_code` uses the Solidity custom-error name (e.g. `InsufficientFinancingCapacity`) instead of the reference model's own `ApplyRejectReason`/`InstantiateRejectReason` value (e.g. `INSUFFICIENT_CAPACITY`) | Grep any receipt-building code for string literals passed to `reason_code` and confirm each one is a value from the model's actual reason-code union, not typed by hand to look plausible | `DECISIONS.md` D24 — this happened for real in Gate 6: `notch verify`'s rerun of `apply()`/`instantiate()` can only ever produce the model's own reason strings, so a hand-typed contract-style name is guaranteed DRIFT |

## Frontend (built in Gate 8 — 2026-09-10)

Verified by direct code scan, `next build --webpack`, and SSR curl checks (F1, F2, F6,
F7, F10, F11 — no emoji/non-lucide-icon/ethers/banned-copy/arrow-button/typed-amount
path exists anywhere in the built app). F3, F4, F5, F8, F9 depend on actually clicking
through a live, connected-wallet session, which no browser automation tool in this
environment could do — see `DECISIONS.md` D30. Re-confirm those five by hand before
relying on this row set as closed.

| # | Must never happen | How to try it | Source |
|---|---|---|---|
| F1 | A literal emoji appears anywhere — UI, copy, toasts, logs | Grep the built frontend and console output for emoji codepoints | Standing rule, non-negotiable |
| F2 | An icon is anything other than a `lucide-react` component | Grep for `<img`, inline SVGs, or emoji used as icons | Standing rule |
| F3 | A capacity or amount figure is shown before it's decoded from a verified proof | Load Surface B before verification completes; confirm no placeholder number renders | PRD Appendix E — "capacity appears from the proof, never typed" |
| F4 | The UI claims a source is "verified" while any step (proof fetch, on-chain verify, decode) was simulated or blocked | Force a `BLOCKED_BY_ATTESTCOIN` condition and check the copy shown | PRD invariant 5; non-negotiable rules |
| F5 | A refused draw renders as a crash, an apology, or generic error styling | Trigger `InsufficientFinancingCapacity` in the UI and check the Activity surface | PRD Appendix E — "calm, not an error toast" |
| F6 | The button/copy says "Submit," "Something went wrong," or includes an apology | Grep frontend copy strings | PRD Appendix E, verbatim copy rules |
| F7 | A `->` appears on a button, or ALL-CAPS eyebrows, or middle-dot decoration appear anywhere | Visual/grep check against Appendix E's "Do not" list | PRD Appendix E |
| F8 | The empty, loading, pending-attestation, proof-failed, or insufficient-capacity states are missing or unstyled | Force each state deliberately and check it renders as a first-class surface, not a blank screen | PRD section 7.8 |
| F9 | A number shown in the UI doesn't match what a `notch verify` recompute produces for the same receipt | Cross-check any on-screen figure against the CLI's recomputed value | PRD acceptance criterion 2 |
| F10 | ethers.js, `@gluwa/usc-sdk`, or any non-wagmi/viem web3 library ends up in the frontend bundle | Check the frontend's dependency tree | Standing rule — "no ethers," `@gluwa/usc-sdk` pulls in ethers transitively |
| F11 | The typed-amount control (the `user_supplied_amount` ablation) is reachable on any path that touches the production `instantiateClaim`/`finance` | Try to wire the demo-only typed control to a real transaction | PRD v2 material change 8 |
| F12 | A frontend build or handoff omits the landing page at `/` | Open `/`: confirm the value proposition, tally-stick story, three-step flow, real evidence preview, and **Try the live demo** CTA; repeat this requirement in every frontend agent prompt | Explicit user correction, September 11, 2026; `AGENTS.md` |
| F13 | Verify is an empty hash form that requires outside knowledge | From `/`, open `/verify`, verify the preloaded real demo without a wallet, reset with **Use demo cashflow**, and reach Position without copying a hash | Explicit user correction, September 11, 2026 |
| F14 | A view screen (Position, Activity, recompute, landing-page evidence preview) shows a hardcoded, cached, or wallet-gated number for data that actually exists on-chain; or a screen breaks below 375px width | Load each view screen with no wallet connected and confirm every on-chain figure still renders (connecting a wallet must only enable actions, never change what's displayed); resize the viewport to 375px and confirm no horizontal overflow or clipped content | Explicit user correction, September 11, 2026 |
| F15 | A live on-chain read is silently topped up, merged, or backfilled with a fixed/recorded fallback value when the real result is empty or doesn't contain it | Grep the codebase for any recorded tx hash, claim id, or amount imported into a data-loading function (not a copy string) and trace whether it's ever unioned into what a live query returns | `DECISIONS.md` D38 — `readDemoLoan`/`lib/demo.ts` did exactly this in Position/Activity, reported as fixed once already before the actual injection was found and removed |
| F16 | A refusal shown as evidence (an overdraw check, a limit demonstration) is a read-only `simulateContract`/`eth_call` preview instead of a real, broadcast, mined transaction with a real explorer link | Trigger the refusal control and confirm a real tx hash resolves on the chain's own explorer with `status: reverted` — not just a UI message | `DECISIONS.md` D38 — also note the underlying gotcha: a guaranteed-to-revert call needs an explicit `gas` limit or `writeContract`'s pre-flight `eth_estimateGas` throws before ever broadcasting anything |
| F17 | Tour/walkthrough chrome ("Step X of Y", a screen labeled "the demo ___" instead of its real product name) appears on a product screen (Position, Verify, Activity) | Grep frontend copy for `Step \d of \d` and any `demo`-prefixed heading on a non-landing-page screen | Explicit user correction, September 11, 2026 |

## Cross-cutting / process discipline

| # | Must never happen | Source |
|---|---|---|
| X1 | A capacity, fill, receipt, or savings number appears anywhere (docs, UI, README) without a file and a denominator behind it | PRD section 22 build contract |
| X2 | A blocked Attestcoin capability is simulated, faked, or silently dropped instead of named `BLOCKED_BY_ATTESTCOIN` | PRD invariant 5 |
| X3 | A silent fallback occurs from a real Attestcoin-verified source to a self-minted or simulated one, anywhere, ever | PRD non-negotiable rules, restated every gate |
| X4 | Evidence of a losing, refused, or blocked run is deleted rather than recorded | PRD section 7.7, Gate 9 pass rule |
| X5 | A gate is reported PASS without the injected/real failure actually being run (reasoned about instead of executed) | Gate 5 explicit instruction: "inject real failures, don't simulate the reasoning" |
| X6 | Code claims to match a live third-party interface (Attestcoin ABI, Decoder, precompile) that was never confirmed against the real deployed thing | `DECISIONS.md` D5/D8 — "do not code against a blog ABI" |
| X7 | A contract is deployed, a real transaction is broadcast, or a commit is made without being explicitly asked for in that moment | Standing operating rule for this project (see memory) |

## What this file is not

Not a spec (that's `Notch-PRD.md`) and not a changelog (that's `DECISIONS.md`/`GATES.md`).
When a row here is confirmed to hold, the evidence belongs in one of those files with a
receipt, tx hash, or test name — not just a checkbox here. When a row here is found to be
*violated*, that's a P0/P1 finding: stop and fix it before continuing whatever gate is in
progress, the same way the decimals and owner-bypass bugs were handled in Gates 3–5.
