# Decisions

Append-only log. Evidence may correct `Notch-PRD.md`; corrections are recorded here, not
made silently. Never shrink a claim or drop a feature without an entry here explaining
why.

## D0 — 2026-09-09 — Language and web3 library

TypeScript with wagmi/viem for `web/` and `adapter/`; Solidity for `contracts/`. No
ethers, anywhere, including transitively through `@gluwa/usc-sdk` (which requires
ethers v6) — proofs are fetched over HTTP via `fetch` and submitted to the precompile
via viem. Decided on day one per PRD section 13; not reopened.

## D1 — 2026-09-09 — Original insight

The naive design treats the Attestcoin proof as a fact to read and the financing amount
as an input to trust from the borrower. The actual design: the amount and lock
conditions are decoded from the verified transaction and become a scarce, conserved
resource on Creditcoin. The proof is not a signal feeding a lending decision — it is the
source of the number itself. This is why capacity can never be user-supplied (PRD
invariant 1) and why the venue's `finance` consumes capacity before any transfer (PRD
Appendix C).

## D2 — 2026-09-09 — Monorepo tooling

npm workspaces (root `package.json` lists `core`, `contracts`, `adapter`, `cli`, `web`).
No separate monorepo tool (Turborepo/Nx) — the repo is small and the PRD's five folders
map directly to workspace packages. `core/` uses vitest for the reference-model test
suite (fast, ESM-native, no network needed — matches "deterministic, no network" from
PRD section 13).

## D3 — pending — Contracts tooling

Foundry vs. Hardhat for `contracts/` has not been decided yet; will be recorded here
before Gate 3 starts, once CC3 Testnet RPC/deploy specifics are confirmed against
Appendix D.

## D4 — pending — Gate 1 evidence

Gate 1 (decode seam spike) requires a funded Sepolia wallet and a funded Creditcoin CC3
Testnet wallet. Outcome and evidence will be recorded here once run.

## D5 — 2026-09-09 — PRD revised to v2; patched in place, did not restart

`Notch-PRD.md` was replaced with the content of the user-supplied `Notch-PRD v2.md`
(now identical). No gate was re-done; work so far (Gate 0 scaffold, in-progress Gate 1
scripts) was patched forward. Material changes and how each was applied:

1. **Receipt success check required** (`instantiateClaim` must `require(receiptStatus
   == 1)` before creating capacity). `contracts/src/Gate1DecodeProbe.sol` already had
   this check before v2 arrived (I had independently reached the same conclusion from
   the official ASCMinter/ASCLoanManager examples during research) — confirmed
   compliant, no code change needed. Still binding for the Gate 3 production registry.
2. **Capacity = decoded event `depositAmount`, never `totalAmount`.** The probe decodes
   `depositAmount` from the `CreateLockupLinearStream` *event* (via
   `Lockup.CreateEventCommon`), not from calldata — already compliant. No path in the
   current code reads `totalAmount` at all.
3. **Event decode preferred; calldata is an authenticated fallback only if logs are
   absent from `txBytes` on CC3**, and the README must state which path was used. The
   probe currently only implements the event path (correct for the primary case). Gate
   1's run must record whether `CreateLockupLinearStream` was actually present in the
   decoded receipt logs; if it ever isn't, a calldata fallback needs implementing before
   Gate 3, and the boundary documented per PRD Appendix D. Not yet exercised — pending
   funded wallets.
4. **Do not hardcode the Sepolia chain key.** `scripts/lib/constants.mjs` previously
   exported `SOURCE_CHAIN_KEY_SEPOLIA = 1` as if settled. Renamed to
   `SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT` and added `scripts/confirm-chain-key.mjs`,
   which calls the live `ChainInfo` precompile's `get_supported_chains()` — no funded
   wallet needed, it's a read-only call. **Run 2026-09-09: confirmed.** chainKey `1` =
   Sepolia (chainId `11155111`, name `"Sepolia ethereum"`); chainKey `3` = Ethereum
   mainnet (chainId `1`). Matches the documented default exactly, but now it's evidence,
   not an assumption. Raw result: `data/gate1/chain-key.json`.
5. **Decoder method names and the BlockProver verify entrypoint are not confirmed;
   read the live ABIs, don't code against a blog ABI.** `Gate1DecodeProbe.sol`'s
   `INativeQueryVerifier` and `IEvmV1Decoder` interfaces were transcribed from
   `gluwa/creditcoin3` (official; `precompiles/metadata/abi/block_prover.json`, the
   project's own published interface for the deployed precompile) and
   `gluwa/USC-Builder-Examples` (official; `EvmV1Decoder.sol`), then cross-checked
   against a working third-party hackathon spike (`Shaydez-Defi/tru`, same track, same
   pinned addresses) that flagged a live gotcha: the deployed Decoder's
   `getLogsByEventSignature` reverts on CC3 testnet, so log filtering must happen
   in-contract by looping `receiptLogs` manually — the probe already does this. This is
   the strongest available source short of a live call, but it is still provisional:
   **not confirmed** until Gate 1 actually calls `verifyAndEmit` and `decodeReceiptFields`
   against a real proof and gets back well-formed data. Fund-free liveness check run
   2026-09-09 (`scripts/probe-live-addresses.mjs`,
   `data/gate1/address-probe.json`): all four pinned addresses have something live at
   them (SablierLockup and the Decoder contract carry real bytecode; the two precompiles
   correctly show empty `eth_getCode`, which is normal for native precompiles — verified
   independently since the ChainInfo call above actually worked despite that). This
   confirms the addresses aren't dead, not that the ABI is exactly right — that
   confirmation is still gated on a real `verifyAndDecode` call once wallets are funded.
6. **Two demo lenders must be distinct funded wallets.** Not yet relevant (Gate 6 is far
   ahead of current progress) — noted here so wallet generation later provisions Lender
   A, Lender B, and the borrower as three distinct burner keys, never reusing one.
7. **Public `/verify` surface added to scope** (recomputes `available` from Creditcoin
   storage without the app, per a README recipe) — added to Gate 8/9 scope; no code yet.
8. **Typed-amount control must be shown to disagree with the decoder in the demo, and
   must not be callable on the production `instantiateClaim`.** Confirms `Gate3`'s
   registry takes no amount parameter at all (already the design — `instantiateClaim`
   only takes proof inputs, matching Appendix C). The typed-amount path is a separate,
   clearly-labeled demo-only control for the `user_supplied_amount` ablation (Gate 7),
   never merged into the real contract.
9. **Reference-model fixture list expanded** (failed receipt, broker-fee `totalAmount`
   vs event `depositAmount`, wrong chain key, missing precompile, unauthorized venue,
   fake merkle proof, remainder+1, two-lender race, replay) — noted for Gate 2, not
   started yet.
10. **Differentiation may name in-hackathon entries** (Tutorial 4, CrossCredit, CreditX,
    HashCredit) but never anything outside this hackathon — noted for Gate 9 README/copy.

## D6 — 2026-09-09 — Sepolia chain key confirmed live

See D5 item 4. `chainKey = 1` for Ethereum Sepolia, confirmed against the live
`ChainInfo` precompile on CC3 Testnet, not assumed from docs. Evidence:
`data/gate1/chain-key.json`.

## D7 — 2026-09-09 — Pinned-address liveness probe

See D5 item 5. All four PRD-pinned addresses (SablierLockup v4.0 Sepolia, BlockProver
precompile, ChainInfo precompile, Decoder contract) confirmed reachable before any
funded-wallet interaction. Evidence: `data/gate1/address-probe.json`. This is a
liveness check only, not an ABI confirmation.

## D8 — 2026-09-09 — Gate 1 PASSED end to end

Full chain, real transactions, no simulation of anything: created Sablier stream 177 on
Sepolia (deposit 100,000 `NotchDemoAsset`, `cancelable=false`, zero unlock amounts) →
fetched its Attestcoin inclusion proof from the live ProofBuilder API → verified it
on-chain via the BlockProver precompile on CC3 Testnet → decoded `depositAmount` and
`unlockAmounts` from the verified transaction's `CreateLockupLinearStream` **event**
(never calldata, never `totalAmount`, never typed) → every decoded field matched the
local Sepolia record exactly. Full detail and tx hashes in `GATES.md` Gate 1 section;
raw evidence in `data/gate1/`.

Notable outcome for D5 item 5: the `INativeQueryVerifier` / `IEvmV1Decoder` interfaces
sourced from official gluwa repos (never a blog) worked correctly on the **first live
attempt** — both the pre-send simulation and the real transaction succeeded without
needing an ABI correction. PRD v2's caution to confirm live before trusting these
interfaces was right to apply, and now they're confirmed, not just sourced well. The
"event logs absent, fall back to calldata" branch (PRD v2 item 3 / Appendix D) was never
exercised — logs were present in `txBytes` on CC3 as expected, so Gate 3's registry can
implement the event path as primary and treat calldata fallback as a documented,
untested branch unless a future position ever needs it.

Also resolves D5 item 6 wallet-provisioning note partially: the Sepolia burner
(`0xB112f2cAdE7743833F9fbc2Fd58BD4779F9e0C03`) and CC3 burner
(`0x8d3D151BE11977b2BF61CFF0Ca0550Fc4d043EdE`) generated for Gate 1 are one wallet for
the borrower/creator role. Gate 6's two distinct lender wallets are separate and not yet
generated.

Gate 2 (reference model) may now start.

## D9 — 2026-09-09 — Reference model: two additions beyond Appendix C's literal text

`core/reference_model.md` and `core/src/instantiate.ts` implement two checks that
Appendix C's terse pseudocode comments don't spell out as their own numbered steps,
both required to satisfy this gate's explicit fixture list:

1. **`precompileAvailable`**, checked before `proofVerified`. Appendix C's step 1 is
   `BlockProver.verify(...) -> require(verified)`, which presumes the call itself
   succeeds. The `missing-precompile` fixture requires modeling the precompile being
   unreachable at all (Attestcoin down) as *distinct* from the precompile executing and
   returning `false` (`fake-merkle-proof`) — a real difference in production, since an
   EVM call to a nonexistent/unresponsive precompile address fails differently than one
   that runs and returns false. Kept as two separate reject reasons
   (`PRECOMPILE_UNAVAILABLE` vs `PROOF_NOT_VERIFIED`) for that reason.
2. **`chainKey === EXPECTED_CHAIN_KEY`**, checked as part of shape validation. Not one
   of Appendix C's four listed shape conditions, but required by the `wrong-chain-key`
   fixture and consistent with PRD v2 Appendix D's "confirm against ChainInfo... do not
   assume it" (already acted on for real in Gate 1, D6). Rationale: the same contract
   bytecode can in principle be deployed at the same address on more than one chain
   (e.g. via `CREATE2`), so a proof that genuinely verifies for the *wrong* chain, with a
   coincidentally-matching source address, needs its own independent check rather than
   being folded into `proofVerified`.

Also: `apply`'s permit formula includes `amount > 0`, which Appendix C's `consume()`
comment doesn't list explicitly (only `require(claims[claimId].active)` and
`require(amount <= available(claimId))`). Included because this gate's own instructions
state it explicitly and the `zero-amount` fixture requires it. Gate 3's `consume` must
enforce it too.

None of this is scope creep — every addition exists because a required fixture cannot
pass without it, and each is called out here rather than silently added. See
`core/reference_model.md` for the full permit-condition tables in enforcement order.

## D10 — 2026-09-09 — Gate 2 PASSED: reference model built, fixture pack complete

`core/reference_model.md`, `core/src/instantiate.ts`, `core/src/apply.ts`,
`core/src/claim-id.ts`, `core/src/constants.ts`, `core/src/types.ts`. 16 fixtures, one
golden file each (`core/fixtures/`, `core/fixtures/golden/`), generated via
`core/generate-golden.mjs` from the reviewed implementation and manually checked field
by field before being locked in as ground truth (not auto-trusted from a single run).
`core/src/model.test.ts`: 24 tests, all passing; `npx tsc --noEmit` clean.

Fixtures are grounded in the real Gate 1 Sablier stream (tx
`0x9d3a4...80cc8`, stream 177) wherever a real value applies, including the
`two-lender-race` fixture, which deliberately reuses the PRD's own documented demo
numbers (70,000 drawn, 30,000 remaining, 50,000 refused) rather than arbitrary ones.
Every purely negative or hypothetical fixture is marked `"synthetic": true` with a
`"note"` field stating exactly what was changed from the real record and why — per the
no-fabrication discipline, nothing claims to be real that isn't.

Full detail: `GATES.md` Gate 2 section. Gate 3 (registry and venue contracts) may now
start — its Solidity must be tested against this exact model's fixture pack, not a
paraphrase of it.

## D11 — 2026-09-09 — Gate 3: two corrections between the model and the contract

Writing `AttestedCashflowRegistry.sol` against `core/reference_model.md` surfaced two
real discrepancies. Both are fixed rather than left silently inconsistent, per "the
contract must match the reference model one-to-one."

**1. Check order: `sourceContract` vs `chainKey`.** Gate 2's model checked `chainKey`
before `sourceContract`. This gate's contract spec numbers them the other way
(`sourceContract` at step 4, `chainKey` at step 5). Reordering two independent boolean
checks can only change behavior for an input that fails *both* simultaneously — no
fixture in the pack does that (each flips exactly one field) — so `core/src/instantiate.ts`
was reordered to match the contract, all 16 goldens were regenerated, and `npm test`
still shows 24/24 passing with byte-identical output. `core/reference_model.md`'s table
updated to match. This is the intended direction of correction: the more specific,
just-given contract spec is authoritative over the earlier model where the two
disagreed on something this arbitrary.

**2. claimId must not trust a caller-supplied `sourceTxHash`.** The model (and PRD
section 8's schema, read literally) computes `claimId = keccak256(chainKey,
sourceTxHash, streamId)` where `sourceTxHash` is an opaque input field the model already
treats as trustworthy. On real bytes this doesn't hold: `sourceTxHash` has no
cryptographic relationship to `txBytes` unless something derives it from `txBytes`
itself. If the contract accepted a caller-supplied `sourceTxHash` for claimId
uniqueness, an attacker could call `instantiateClaim` many times with the *same* real,
verified `txBytes` (and therefore the same real capacity-worth of a Sablier stream) but
a different claimed `sourceTxHash` each time — `verifyAndEmit` would happily re-verify
the same proof every time (it doesn't itself enforce single-use), and the registry's
`!claims[claimId].active` guard would never fire because each fabricated `sourceTxHash`
produces a different `claimId`. That mints unlimited claims, and therefore unlimited
financing capacity, from one real locked position — a direct break of invariant 3
(conservation) and invariant 5 (instantiated at most once).

Fix: `AttestedCashflowRegistry.instantiateClaim` derives claimId from
`keccak256(chainKey, keccak256(txBytes), streamId)`. `keccak256(txBytes)` cannot be
spoofed independently of the real, `verifyAndEmit`-authenticated transaction, so it's a
sound uniqueness key. The function still accepts a caller-supplied `realSourceTxHash`
parameter and stores it on the claim (`Claim.sourceTxHash`, matching the PRD's schema
field, e.g. for linking to Etherscan in the UI later) — but that value is now
provenance/display only, never part of the security-critical derivation. Recorded, not
silently patched: `core/reference_model.md` gained a "layering note" explaining that the
pure model reasons about already-decoded, already-trustworthy facts, while this
particular trust boundary only exists at the raw-proof-bytes layer the model doesn't
operate at — so Gate 2's fixture pack and goldens are correct as they stand and did not
need to change for this.

Also worth naming: `instantiateClaim`'s event-search loop can fail to find any
`CreateLockupLinearStream`-shaped log at all (`EventNotFound`) — a failure mode with no
equivalent in the reference model, because the model's `Proof` type assumes a
successfully-decoded event already exists. Same layering distinction as above, not a gap
in either artifact.

## D12 — 2026-09-09 — Attestcoin proofs go stale within hours; refetch before use

Gate 1's proof for the real Sablier stream (fetched ~08:31 UTC) was rejected by the
BlockProver precompile at ~13:00 UTC with `"Continuity proof does not match attestation
or checkpoint"`. Refetching the same tx's proof produced a **materially different**
payload: `continuityProof.roots` grew from 8 entries to 98 as the attested chain
advanced (chain tip moved roughly 1,200 blocks in that window). This directly confirms
the open question flagged back in the original PRD (section 23): "the co-design question
to the Creditcoin team on establishing freshness under the inclusion-only model." A
cached ProofBuilder response is not safe to hold and reuse across an arbitrary time gap
— **fetch immediately before submitting, not once and cached for later use.** Every Gate
3 script that submits a proof on-chain refetches it right before use rather than reusing
a saved file from an earlier step. This is an operational rule going forward, not a
one-off workaround: any future gate (paper receipts, live loans, the campaign runner)
must refetch, not replay, a stored proof payload.

## D13 — 2026-09-09 — Real on-chain finding: a wrong chainKey fails at proof
verification, not at the registry's own chainKey check

Gate 2's model (and this gate's contract) both have an explicit, independent
`chainKey == EXPECTED_CHAIN_KEY` check, reasoned about in D9/D11 as defense against a
proof that "genuinely verifies for the wrong chain." Running the actual on-chain test
(same real proof, `chainKey` parameter swapped from 1 to 3) showed the revert happens
**before** that check is ever reached: `BlockProver.verifyAndEmit` itself reverts with
`"Continuity proof does not match attestation or checkpoint"`, because `chainKey` is fed
directly into the precompile's own cryptographic verification, which is chain-specific.
So on real Attestcoin infrastructure, `ChainKeyMismatch` is currently unreachable via
legitimate proof data — a wrong chainKey and a merely-malformed proof both surface as
`VerificationFailed`. The check is kept anyway: it costs nothing, it's the literal
contract spec given for this gate, and it remains meaningful defense-in-depth if
Attestcoin's verification semantics ever change (e.g. if a future release stops binding
chainKey this tightly, or if the same bytecode is ever deployed at the allowlisted
address on more than one chain in a way the precompile can't itself distinguish). Not a
bug — a documented real-world finding about where a boundary actually lives, found by
testing the real thing rather than assuming the pure model's check ordering predicts the
real system's failure surface.

## D14 — 2026-09-09 — Serious bug found and fixed by real on-chain parity testing: a
decimals mismatch that silently defeated conservation

The first `CashflowLendingVenue.finance(claimId, amount)` used one raw `amount` for both
`registry.consume(claimId, amount)` and `ccUSD.transferFrom(lender, borrower, amount)`,
exactly as `Notch-PRD.md` Appendix C's pseudocode literally shows. This is wrong whenever
the deposit asset and ccUSD have different decimals — which they do here: ccUSD is
pinned at 6 decimals (Appendix C, unconditional), while the real Gate 1 deposit asset
(`NotchDemoAsset`) has 18 (an ordinary, unremarkable ERC-20 choice, not called out
anywhere as needing to match ccUSD). Passing a human-scale ccUSD amount (e.g. `70_000n *
10n**6n`, meant as "70,000 ccUSD") against an 18-decimal, ~10^23-scale capacity
consumed only 7×10⁻¹³ of it — meaning **conservation was silently unenforceable**: any
realistic draw request looked "available" no matter how many times it was repeated,
because the number being checked against `available()` was never in the same units as
`available()` itself. This was caught immediately by Gate 3's own on-chain parity
requirement — "Lender A finances 70,000" appeared to succeed, but the very next
over-draw test that should have reverted (`InsufficientFinancingCapacity`) also
"succeeded," which is what exposed it. Exactly the scenario this gate's real testing was
for.

**Fix:** `amount` in `finance()` is defined to always be in the deposit asset's native
decimals (the same scale as `originalCapacity`/`available()`), so `registry.consume()`
needs no conversion at all and matches Appendix C's literal math. The venue converts to
ccUSD's own decimals only at the point of transfer, via a fixed scale factor. A first
attempt at this fix tried to look up the deposit asset's decimals on-chain
(`IERC20(claim.asset).decimals()`) — also wrong, and caught the same way (the very next
real transaction reverted): `claim.asset` is the token's address **on Ethereum
Sepolia**, decoded from the cross-chain proof; there is no contract at that address on
CC3 Testnet to call. Since every claim a given registry instance ever creates shares the
same `approvedDemoAsset` (enforced by `instantiateClaim`'s `TokenNotApproved` check),
its decimals are fixed, known, deployment-time operator metadata — not a per-claim
lookup, and not something that can be fetched cross-chain without another Attestcoin
proof for a fact this trivial. `CashflowLendingVenue`'s constructor now takes
`depositAssetDecimalsValue` (`18` for this deployment) as an explicit operator-supplied
argument instead.

Both the buggy venue and its half-fixed successor were caught by rerunning the real
on-chain finance flow immediately after each deploy, before treating either as done —
neither shipped past that check. `AttestedCashflowRegistry.setVenue` was also changed
from one-time-locked to owner-updatable specifically so a venue redeploy (this happened
twice) doesn't orphan claims already stored in the registry; the real Gate 1 claim
survived both venue redeploys unchanged. Current deployment: `data/gate3/deployment.json`.

## D15 — 2026-09-09 — On-chain fixture coverage: two honest gaps, documented not faked

Of the 16 Gate 2 fixtures, 14 were exercised on-chain with a real revert (see `GATES.md`
Gate 3 section for the full list and tx hashes). Two were not, for reasons specific to
what's actually producible as a real on-chain condition in the time available, not
skipped for convenience:

- **`broker-fee-total-amount`**: structurally impossible to trigger a "wrong" outcome
  on-chain, because the deployed decoder never reads a `totalAmount` field at all — there
  is no code path that could read the wrong number. This is stronger evidence than a
  runtime test could give (a passing runtime test only shows today's input didn't
  trigger a bug; the absence of the field entirely means no input could).
- **`wrong-source-contract`**: unlike `chainKey` (an explicit function parameter that
  can be independently tampered with while reusing a real, otherwise-valid proof),
  `sourceContract` in the deployed contract is *derived entirely* from
  `log.address_` on the verified transaction's own decoded receipt logs — there is no
  caller-supplied value to swap. Producing a genuine on-chain test would mean deploying
  a decoy Sepolia contract that emits a byte-identical `CreateLockupLinearStream` event
  under a different address, proving that, and submitting it — a real but materially
  bigger side quest than tampering one parameter. The code path
  (`if (sourceContract != ALLOWLISTED_SABLIER_LOCKUP) revert
  SourceContractNotAllowlisted();`) exists, is reviewed, and is exercised by the pure
  reference-model fixture; it has not been exercised by a live on-chain revert.
- One more worth naming for completeness even though it wasn't in the original 16:
  `past-cliff` (`cliffTime > block.timestamp`) also wasn't exercised on-chain. A real
  test needs either waiting out a real stream's 7-day cliff or creating a short-cliff
  stream and waiting for it in real time; not done here for time reasons. Same
  disclosure standard as the two above: the check exists, is reviewed, and is covered by
  the pure-model fixture only.

No claim in `CLAIMS.md` or `GATES.md` states these three fixtures were proven on-chain.
This is exactly the discipline the PRD asks for: name a boundary rather than quietly
shrink or fake past it.

## D16 — 2026-09-09 — Gate 4: real `adapter/` and `cli/` packages, not more scripts

`Notch-PRD.md` section 13 designates `adapter/` for the ProofBuilder client and
precompile calls, and `cli/` for `verify`/`campaign`. Gates 1–3 built this logic as
one-off `.mjs` scripts under `scripts/`, which was right for spikes but wrong to keep
doing once a *reusable* pipeline (fetch → verify → decode → judge) and a *reusable*
command (`notch verify`) were actually needed. Built for real this gate:
`adapter/src/{proof-builder-client,onchain,build-proof,ledger}.ts`,
`cli/src/{verify,index}.ts`. `scripts/gate4-paper-run.ts` remains a one-off orchestration
script (it's a gate-passing exercise, not a reusable command), but it now imports the
real adapter/core modules instead of duplicating their logic.

One correction needed to make this compile: root `package.json` had no `"type": "module"`
field (the existing `.mjs` scripts didn't need one — that extension is always ESM
regardless), but `.ts` files run via `tsx` are interpreted per the nearest
`package.json`'s `type` field, which defaulted to CJS and broke top-level `await`. Added
`"type": "module"` at the root; re-ran the full test suite afterward with no regressions.

## D17 — 2026-09-09 — Receipt schema: a documented, additive superset of PRD section 9

`Notch-PRD.md` section 9 lists `proof_inputs` as `{chainKey, headerNumber, txHash, hash
of the raw proof payload}` — provenance, not enough on its own to rerun `instantiate()`
offline. The implemented `Receipt` type (`core/src/receipt.ts`) adds `decodedProof` (the
full assembled `Proof` used for that instantiate) to `proof_inputs`, and adds
`claim_before`/`claim_after` (full `Claim` objects, not just the bare `capacity_before`/
`capacity_after` numbers the schema names) plus an `action: "instantiate" | "finance"`
discriminator the schema doesn't have a slot for (J3's "fake source refused" journey has
no lender or amount at all, so it needs some way to be a receipt without those fields
meaning nothing). Nothing from the PRD schema was removed; every field it names is still
present. This is what makes `notch verify` able to fully rerun *both* legs of the
reference model (`instantiate` and `apply`) from a single receipt file with no other
input — a stronger form of "a published receipt recomputes in the CLI" (acceptance
criterion 2) than the minimal schema alone would allow.

`computeReceiptHash` (invariant 9: "covers proof inputs and capacity math, not prose")
hashes `mode, action, claim_id, proof_inputs, claim_before, claim_after,
capacity_before, capacity_after, lender, amount, refused, reason_code` — and explicitly
excludes `receipt_id` (identifier, not data), `verify_command` (derived string),
`limitations` (literally prose), `recorded_at` (timestamp), and `fill` (settlement
metadata, not proof input or capacity math). Verified by a dedicated test
(`core/src/receipt.test.ts`) and by deliberately tampering a receipt and confirming
`notch verify` reports `DRIFT` on both the hash check and the recomputed-claim check
independently (`GATES.md` Gate 4).

## D18 — 2026-09-09 — Proof freshness (D12) is now an enforced check, not just a habit

D12 established the *practice* of always refetching rather than reusing a saved proof.
Gate 4 turns that into an actual code-level guard: `fetchFreshProof` compares the
ProofBuilder API's own `generatedAt` timestamp against a 15-minute
`PROOF_STALENESS_LIMIT_MS` and throws `StaleProofError` if exceeded, rather than
silently handing back a payload that might already be too old to verify (the API can
return `cached: true` even on request that's "fresh" from the caller's perspective).
15 minutes is a conservative fraction of the ~4.5-hour staleness window observed once in
Gate 3 — treated as an upper bound on how long a proof stays valid, not a guarantee, so
the limit is set well inside it.

## D19 — 2026-09-09 — Write-ahead intent ledger and durable PAPER effects

Gate 4's in-memory paper balances and post-effect ULIDs cannot recover a lost response.
`PaperPipeline` now durably appends a pending intent before proof fetching. Keys cover
PAPER, source/claim identity and action; finance also includes the caller's persistent
intent ID, lender and amount. Instantiate is claim-scoped, independent of request ID.
A loan intent cannot be rebound to different parameters. Timestamps, fresh proof hashes,
and random IDs do not affect identity. Callers must persist and reuse their intent ID.

`data/paper/ledger.json` is the authoritative append-only recovery event history
(pending/finalized/abandoned); `effects.json` is the durable simulated state-change
store, whose entries atomically contain both claim transition and simulated finance.
The existing `data/ledger.jsonl` remains the finalized receipt publication log.
This additive separation preserves the Gate 4 receipt schema and hash contract.
A query of the effect store precedes every apply; a landed action supplies the original
receipt. Startup scans the event history and finalizes landed actions or appends an
explicit abandonment only after confirmed absence. Query failure preserves pending and
blocks new work. A later retry of an abandoned action can reopen the same key.

Histories only grow semantically; physical writes flush a complete temporary file then
atomically replace the old complete file, avoiding torn JSON tails on process death.
No old events are removed. Receipt publication similarly preserves the existing log
prefix and rejects conflicting duplicate IDs; lookup prefers the authoritative log over
its disposable per-receipt cache. This is appropriate for the small prototype ledger;
it is not an unbounded-volume storage design or a power-loss durability claim.

## D20 — 2026-09-09 — Local writer exclusion and enforced startup barrier

The PAPER adapter owns a local OS TCP lease derived from the canonical store path for
the entire resolve/fetch/query/apply/publish cycle. A killed process releases the lease
automatically; there is no stale PID-file takeover race. Port collisions fail closed.
This is a single-host/local-filesystem design. All writers to a PAPER store must use
this adapter; Gate 4's historical exercise script is not the recovery entrypoint.
Use `npx tsx cli/src/index.ts paper <action.json>` or `recover`. Both run the startup
barrier; `run()` enforces it too, so direct adapter callers cannot skip recovery.
`verify` remains offline/read-only and need not fetch proofs or resolve writes.

Action JSON fields: `mode: "PAPER"`, `action: "instantiate" | "finance"`, `chainKey`,
`txHash`, `streamId`, `blockNumber`, `intentId`; finance also requires `lender` and
integer-string `amount`. A distinct loan requires a distinct intent ID. LIVE is rejected.
The CLI proof provider uses assembleFreshProof with real on-chain verification/decode;
no private-key signing is needed. No live instantiateClaim or finance submission path
is introduced: PAPER instantiate is a durable reference-model transition. Live chain
reconciliation and settlement evidence remain for Gate 6.

## D21 — 2026-09-09 — Freshness at recovery, and precise failure evidence

Retries query first: a landed action is finalized from its original effect, even if
its old proof has since expired. Only an absent action fetches a new proof. The adapter
checks generatedAt at use and refetches on StaleProofError (bounded to two attempts).
The key remains unchanged. Invalid or future generatedAt also fails closed. ProofBuilder
HTTP calls now have a 30-second AbortSignal timeout rather than hanging indefinitely.

Gate 5 tests inject actual throws, a killed child process and an aborted hanging HTTP
request into the real durable PAPER pipeline. Proof inputs in those tests are synthetic
recovery fixtures based on historical decoded inputs; they are not live proof freshness
evidence. The post-commit RPC timeout is a thrown TimeoutError, not a live network event.
All 12 tests pass, including independent verifier tampering; 10/10 Gate 4 receipts still
MATCH. Full per-scenario outcomes and retained evidence locations are in GATES.md.
No abandoned events or prior test runs were silently deleted. No live funds moved.

## D22 — 2026-09-09 — Audit corrects Gates 1–5 claims and blocks premature Gate 6

`AUDIT-GATES-1-5.md` is the full audit. We reproduced all 12 initial adversarial
assertions as failures before changing code, then fixed verifier consistency gaps,
transport-error classification, mismatched ProofBuilder response identity, mutable
PAPER intent capture, finance proof gating and effect-store integrity checks. Three
additional verifier checks bring audit coverage to 15 tests. Historical receipts and
hash schema are unchanged. Full results are retained under `data/audit-gates1-5/`.

Read-only Solidity execution confirmed two open issues, without any transaction:
finance(1) consumes capacity while paying zero ccUSD at 18-to-6 decimals, and the owner
can set itself as venue and consume directly. Failed nonzero transfer rollback also
passed this independent harness. These contract issues remain open; no redeployment
or policy change was silently made. D14's updatable venue requires an explicit admin
trust qualification. D11's model/chain claim-ID difference needs an implemented bridge
before live receipt verification/recovery; explanatory prose is not that bridge.

Corrected the Gate 3 coverage denominator from 14/16 to 13/16: past-cliff is in the
required 16, not an extra. Corrected the Gate 5 table's stale NOT STARTED entry. The
Gate 3 deployment.json remains preserved as historical evidence; current on-chain
venue differs, recorded in contract-readonly.json. No previous evidence was erased to
make the audit look clean. Gate 6 remains stopped pending the open P1 findings.

## D23 — 2026-09-09 — D22's three P1 findings are fixed in source; independently re-verified; deployment is the remaining gap

D22 (round 1 of the audit) left `AttestedCashflowRegistry`/`CashflowLendingVenue` with
three open P1 findings and said Gate 6 stays stopped until they're resolved. A second
round of work then fixed all three directly in the contract source and added on-chain
idempotency, but was cut off by a usage limit mid-session before it updated `AUDIT-
GATES-1-5.md`, `GATES.md`, or this file to say so — so the written record kept
describing the pre-fix state after the code had already moved past it. This entry
records an independent check of that: the actual `.sol` source was read directly, the
full test suite was re-run cold, and `notch verify` was re-run against every existing
receipt, rather than trusting the interrupted session's own summary of its work.

All three confirmed fixed. Detail, file/line references, and the exact mechanism of each
fix are in `GATES.md`'s "Follow-up" section (this same date) rather than duplicated here.
Summary: the zero-settlement rounding bug now reverts (`AmountNotRepresentable`) instead
of silently flooring to zero; the venue is no longer owner-reassignable at all (the
registry deploys its own venue in its own constructor and the address is `immutable`);
and the model/registry claim-identity gap D11 first documented as an intentional
layering difference is now bridged with a versioned, backward-compatible field
(`attestedTxDigest` + `rulesVersion`) so old and new receipts both still compute the
identity they were built under.

One genuine bug surfaced during this verification, and it was in the newly-written
contract test suite, not the contracts: `contracts/test/protocol.test.mjs`'s revert-
matching helper decoded expected errors against only the directly-called contract's ABI,
so a cross-contract revert (`venue.finance()` reverting with a *registry*-defined error
via `registry.consume()`) could never be recognized — not because the contract was wrong,
but because the venue's own ABI has no entry for an error it doesn't declare. Verified
by raw `eth_call`: the correct error selector was in the response every time, just three
levels down the error's `.cause` chain where the test wasn't looking. Fixed by decoding
against every contract's errors combined, not the called contract's alone. 4 tests went
from failing to passing; nothing about the fix touched contract logic.

Full re-verification after that one fix: `npm test` → 82 passing (28 core, 34 adapter,
20/20 contracts, up from 16/20 before the harness fix); strict typechecks clean across
core/adapter/cli; all ten original Gate 4 receipts still `MATCH`. No new deployment, no
new secrets, nothing committed — `.env`'s `VENUE_ADDRESS` still matches the address
actually deployed in Gate 3, confirming nothing was broadcast to CC3 Testnet by any of
this work.

**What remains, stated plainly:** the fixes exist in source and pass local tests against
a synthetic EVM harness (ganache). They have not been deployed. The contracts actually
live on CC3 Testnet right now are still the original, unfixed Gate 3 ones. Gate 6 must
not originate a live loan against that deployment — doing so would reintroduce the exact
P1 bugs (silent zero-payment settlement, owner-bypassable consumption) into a real-money
context. A fresh deployment of the current source, and re-instantiating the real Gate 1
claim against it (claimId derivation is otherwise unchanged from Gate 3, and the claim
already survived two venue redeploys the same way), is Gate 6's first step, not
something to do casually inside it. Not performed here — deploying to CC3 Testnet is an
action with real consequences and wasn't asked for in this pass.

## D24 — 2026-09-09 — Gate 6: a real position can outlive the rules it was created under, and receipt-recording had its own bugs the real world found

**The original Gate 1/3 stream can never satisfy the new registry.** The fixed
`AttestedCashflowRegistry` requires `transferable == false` (D23's collateral-integrity
addition). The real Gate 1 stream (177) was created with `transferable=true`, before
that rule existed. Sablier streams are immutable once created — there is no way to make
177 compliant after the fact. This isn't a bug to route around; it's a real, permanent
consequence of tightening a shape rule after a real position already exists under the
old one. A fresh, rule-compliant stream (180, deposit 1,000 — sized for a micro-loans
gate on purpose) was created instead. The general lesson: any future shape-rule tightening
must account for positions that predate it, either by grandfathering them explicitly or
by accepting, as here, that they simply can't move forward under the new registry.

**Three real bugs were found in the receipt-recording code itself — not the contracts,
not the reference model — each one caught by `notch verify` reporting DRIFT rather than
silently accepting bad data:**

1. `attestedTxDigest` was left `undefined` on hand-built `Claim`/`Proof` objects that had
   `rulesVersion: 2` set. `core/src/validate.ts` correctly rejects this (it requires a
   well-formed hex value whenever a version-2 object claims to be version 2) — which is
   exactly why the first 6 receipts read DRIFT instead of silently recording a
   half-populated object. Fixed by computing `keccak256(txBytes)` once, correctly, and
   reusing that single value everywhere it belongs (the claim's digest and every finance
   receipt's `decodedProof.attestedTxDigest` on that claim are the same real number,
   because they all describe the same real source transaction).
2. `reason_code` was written as the Solidity custom-error name
   (`InsufficientFinancingCapacity`) instead of the reference model's own
   `ApplyRejectReason` string (`INSUFFICIENT_CAPACITY`). This is a structurally
   guaranteed DRIFT, not a subtle one: `notch verify` reruns `apply()`/`instantiate()`
   and compares the recorded `reason_code` against whatever the *model* returns, and the
   model can only ever return its own vocabulary. A receipt's `reason_code` must always
   be copy-pasted from the model's actual reject-reason union, never typed by hand to
   look plausible next to the real Solidity error name (those two vocabularies are
   related but not identical, and a human reading a revert message will naturally reach
   for the Solidity name — this is worth flagging for the campaign runner in Gate 7,
   which will write far more of these).
3. **The most substantive finding.** The real concurrent-race receipt for the losing
   leg (Lender B's 250) recorded `claim_before` as the shared snapshot both legs were
   *submitted* against (600/1000 financed/capacity, available 400) — but that isn't what
   B's transaction actually executed against. Reading both real transaction receipts
   (`getTransactionReceipt`) showed both landed in block 5459466, Lender A at transaction
   index 1 and Lender B at index 2 — meaning B's transaction executed *after* A's had
   already applied, against a true state of 850/1000 (available 150). Recomputing
   `apply()` from the wrong (submission-time) snapshot said B's 250 draw *should* have
   succeeded (250 ≤ 400), which is exactly what `notch verify` correctly flagged as
   DRIFT — the real transaction reverted; the pure model, given the wrong input, said it
   shouldn't have. Fixed by setting `claim_before` to the state after the winning leg's
   already-applied effect, derived from the two receipts' real transaction index order,
   not from either client's local view at submission time.

This third finding directly confirms the concern raised before this gate started: the
D23 claim-ID/bookkeeping reconciliation had only ever been exercised against the 10
PAPER receipts, never against a real concurrent two-lender race on deployed
infrastructure. The first time it was exercised for real, it surfaced a genuine gap —
not in the contract (which behaved correctly throughout: it consumed capacity in true
execution order and reverted the second leg exactly when it should have) but in the
*off-chain bookkeeping's assumption* that "state at submission time" and "state at
execution time" are the same thing under concurrency. They are not, and any future code
that builds a receipt for a concurrently-submitted action must derive `claim_before`
from real execution order (transaction index within a block, or equivalent), never from
a client-side pre-submission read. Recorded as RULES.md B29.

**Discipline followed throughout, not just asserted:** the six malformed intermediate
receipts were never edited in place (mutating a receipt's recorded content under its
existing ID would have defeated the exact tamper-detection Gate 4 built and proved) —
they were voided (moved to `data/gate6/void-receipts/`, removed from the active ledger,
preserved on disk, never deleted) and superseded by newly-ID'd, correct receipts
referencing the identical real transactions. Nothing was resubmitted on-chain to fix a
receipt-recording bug; the six real transactions from the original run are the ones
every corrected receipt still points to.

Final state: `npm test` → 82/82 (unchanged from Gate 5, confirming the deployed bytecode
matches what was tested locally); all 16 receipts in `data/ledger.jsonl` (10 original
Gate 4 PAPER + 6 Gate 6 LIVE) verify MATCH; on-chain conservation exact
(`financedCapacity === originalCapacity`, `1000000000000000000000 ===
1000000000000000000000`). Full detail, every tx hash, and the deployment address table
(old vs. new): `GATES.md` Gate 6.


## D25 ? 2026-09-10 ? Finish the Gates 1?5 audit remediation

The complete closure matrix is at the top of AUDIT-GATES-1-5.md. Version-2 contract, model and PAPER changes were preserved and independently retested against the current workspace, which had advanced through separate Gate 6 work while this turn was interrupted. No new deployment or transaction was performed here.

Closed remaining tooling defects: a shared deployment manifest and read-only topology/decimal check, exact mined-success check in the current deployer, explicit broadcast invocation requirement, retirement of incompatible historical Gate 3 runners, and immutable evidence history before updating JSON latest views. The obsolete pre-fix audit harness is retained but cannot execute against changed constructors. The runnable replacement is the automated contract suite, which decodes cross-contract errors rather than treating arbitrary failures as expected reverts. No historical script or evidence was deleted.

Validation: full 82-test suite passed; the expanded remediation file passed 9/9 (two new checks, 84-test inventory), all 16 current receipts MATCH, adapter/CLI strict typechecks pass, current deployment topology MATCH via read-only RPC. A host-load timeout was corrected only for the child-process crash test: 30-second outer limit, same kill/recovery assertions. Historical 13/16 live coverage remains correctly labelled; local synthetic coverage cannot retroactively become live proof.

## D26 — 2026-09-10 — Gate 7: a proof "from the future" is clock skew, not staleness

`fetchFreshProof`'s staleness check (D12/D18) rejected any negative proof age outright. The Gate 7 campaign's very first real call hit a proof timestamped 139ms ahead of the local clock — ordinary NTP-level drift between our machine and the ProofBuilder API, not a stale/cached response. The check had no tolerance for this at all and blocked real execution.

**Fix:** added `CLOCK_SKEW_TOLERANCE_MS` (5s) in `adapter/src/constants.ts`. Only a negative age *larger* than the tolerance still trips `StaleProofError`; the upper bound (genuine staleness, the D12 Gate 3 incident) is unchanged. Applied consistently to both `fetchFreshProof` (`proof-builder-client.ts`) and the PAPER recovery path's equivalent check (`recovery.ts`), so the two staleness enforcement points can't drift apart. All 36 adapter tests re-passed after the change, confirming no weakening of the actual staleness guarantee.

## D27 — 2026-09-10 — Gate 7: three real finance() refusals were mislabeled; true causes are outside the model's vocabulary by design

The campaign script hardcoded `reason_code: "INSUFFICIENT_CAPACITY"` for every refused `finance()` call rather than inspecting the real revert. Historical-block `simulateContract` replay (`scripts/diagnose-gate7-refusals.mjs`) of all 15 refused attempts found 12 genuine `InsufficientFinancingCapacity` reverts (label was accidentally correct) and 3 that were something else:

- Position 1, step 1 (Lender A, 350): `ActionAlreadyApplied`. The campaign's `nextActionKey()` used small sequential integers (1, 2, 3, ...) starting fresh each run; Gate 6 had already consumed actionKey=1 for this same lender on this same venue contract (`actionResults` is keyed per `(sender, actionKey)` forever on-chain — there is no way to "retry" that exact action).
- Position 3 and 5, step 1 (Lender A, 840 and 700): `MockUSDC: allowance`. Lender A started the campaign with exactly 1000 ccUSD of allowance to the venue (a Gate 6 leftover), consumed 980 across two real successful draws, leaving too little for these two larger first-draw requests — a real funding-setup constraint, not a capacity refusal.

Neither cause has a reference-model reason code (the pure model has no concept of on-chain action-key idempotency or lender token balances at all — same reasoning as the frozen-set's own decision to exclude a literal replay step, `data/gate7/frozen-set.json`'s `note` field). A receipt claiming `INSUFFICIENT_CAPACITY` for either would never reproduce on `notch verify` rerun and would be a fabricated label on a real transaction. **All 3 voided** (RULES.md B31), preserved in `data/gate7/void-receipts/`, documented with their true cause in `data/gate7/campaign-report.json`'s `correctedFindings`. Not retried — the pass bar (≥20 receipted runs) was already cleared by the remaining 28. `nextActionKey()` fixed to a run-salted keccak256 namespace so this class of collision cannot recur in a future run.

## D28 — 2026-09-10 — Gate 7: two receipt-construction bugs, found only by running notch verify on every new receipt, not by inspecting the script

Running `notch verify` on all 31 real Gate 7 receipts (not just spot-checking) surfaced two more bugs, both in receipt bookkeeping, not in the product or in any real on-chain transaction:

1. **Address casing.** The 5 real instantiate receipts recorded `claim_after.asset` from a raw `.env` literal (lowercase), while every other address in the same claim object came from an on-chain `readContract` call (viem checksums address outputs). Same address, two different string representations — `notch verify`'s `eqJson` deep-compare correctly called this DRIFT when `instantiate()`'s rerun (which copies `proof.token` verbatim into `claim.asset`) produced the checksummed form the on-chain read had, not the lowercase form that got recorded. Fixed by checksumming (`viem`'s `getAddress`) every address field written into `decodedProof` in `gate7-campaign.ts`.
2. **Missing claim_before on replay receipts.** All 5 re-instantiation-attempt receipts recorded `claim_before: null`. `instantiate()`'s `CLAIM_ALREADY_ACTIVE` check (`core/src/instantiate.ts`) is conditioned entirely on `priorClaim.active` — with no prior claim to check, a rerun legitimately computes success instead of the recorded refusal. This is the exact same class of bug as D24's `claim_before` finding in Gate 6, reintroduced independently in new code. Fixed by reading the real active claim and recording it as `claim_before` before building the receipt.

Both are bookkeeping-only: the underlying real transactions (5 real `instantiateClaim` calls, 5 real refused re-instantiation attempts) were correct throughout. All 10 receipts voided (preserved in `data/gate7/void-receipts/`) and rebuilt from the same real transaction hashes and current on-chain claim state — nothing was resubmitted. Combined with D27, 13 of 31 real Gate 7 interactions needed a receipt rebuild; the final active set of 28 (44 across the whole ledger) all independently verify MATCH.

## D29 — 2026-09-10 — Gate 8: Next.js 16.2 has no stable release; 16.3.4 fixes a critical Windows RCE the 16.2 line never got

The instruction pinned "Next.js 16.2." The npm registry shows a real stable 16.2 line (16.2.0 through 16.2.12) — not a typo — so `create-next-app` was pointed at 16.2.12 first. `npm audit` on that install reported one critical and two high vulnerabilities in `next@16.2.12`: an unauthenticated remote code execution specific to **Windows-hosted servers**, and a second unauthenticated RCE in the Image Optimization API for AVIF files (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4). This development machine is Windows, and `next dev` was about to be run on it repeatedly for real testing.

**Decision:** bumped to `next@16.3.4` (and `eslint-config-next` to match) — the closest stable release, still Next.js 16, that carries the fix. `npm audit --workspace=web` after the bump: 0 vulnerabilities. This is a security fix, not a preference change, and evidence (a live, disclosed vulnerability) is exactly the kind of thing that's allowed to correct a stale instruction (PRD invariant, "evidence may correct the PRD") — the 16.2 pin necessarily predates the disclosure. Recorded here rather than silently deviating. Everything else in the Appendix E stack instruction was followed exactly, including `--webpack` (`next.config` scripts hard-code `--webpack`; confirmed live via the build banner reading `▲ Next.js 16.3.4 (webpack)`, since 16.3.4 defaults to Turbopack otherwise).

## D30 — 2026-09-10 — Gate 8: no browser automation tool is available; stated plainly rather than papered over

Checked explicitly (tool search for Playwright/Puppeteer/DevTools-style tooling) before building the frontend: none is available in this environment. The pass bar's "a judge completes verify → finance → see-refusal without a terminal, from the UI alone" cannot be independently confirmed by clicking through an actual browser with a connected wallet — that capability doesn't exist here.

**What was done instead, in place of the missing capability, not as a substitute for it:** `tsc`/`eslint`/`next build --webpack` all clean; the dev server run for real with every route curled and checked for correct SSR copy and zero server errors; and, most importantly, `scripts/gate8-integration-check.mjs` executed the *exact same contract-call sequence* the UI's code performs (fresh proof → real `instantiateClaim` → real `finance()` → a real `simulateContract` refusal) against the real demo position, using burner keys instead of a browser wallet. This produced genuine on-chain evidence at the PRD's exact money-shot numbers (100,000 → 70,000 → 30,000 → a real refused 50,000 request). It proves the underlying logic is correct; it does not prove the buttons work when clicked. Gate 8 is reported with that distinction explicit in `GATES.md`'s pass-bar checklist, not folded into a blanket "PASS" — matching X5 ("a gate is reported PASS without the injected/real failure actually being run") and the general instruction to say so explicitly when UI testing isn't possible, rather than claim success.

## D31 — 2026-09-10 — Gate 8: the user's own browser click-through found a real bug the integration script couldn't have

Within minutes of the user starting `npm run dev` and clicking "Verify with Attestcoin" in an actual browser, `instantiateClaim` failed with a wagmi `ChainMismatchError`: the connected wallet was on chain id 1, the write targeted chain id 102031 (Creditcoin CC3 Testnet), and neither `useWriteContract` nor the wagmi config auto-switched the wallet's active network before submitting. This is exactly the class of bug `gate8-integration-check.mjs` (D30) structurally could not find — it drives a burner key directly via a `WalletClient`, which has no "current chain" state to be wrong, only an explicit `chainId` per call. A real wallet extension does have persistent chain state, and nothing in the app told it to change.

Two real gaps, both fixed:
1. **No explicit chain switch before a write.** Fixed in both Surface A (`instantiateClaim`) and Surface B (`approve`/`finance`): call `switchChainAsync({ chainId: cc3Testnet.id })` immediately before the write, surfaced in Surface A's status line (`Switching your wallet to Creditcoin CC3 Testnet`). Also added a persistent nav-bar banner (`useChainId` vs. `cc3Testnet.id`) so a wrong-network wallet is visible and one click from fixed *before* the user ever presses Verify or Finance.
2. **The error shown was the raw viem error dump** (full calldata, full args, hundreds of lines) rather than viem's own concise `shortMessage`. Fixed with a shared `shortErrorMessage()` helper (`web/src/lib/format.ts`) used everywhere a wallet/contract error reaches the UI — this is the same F5/F8 discipline ("a refused draw renders as a crash... never") extended to wallet-level errors, not just contract-level refusals, which the original build had not covered.

Confirmed after the fix: `tsc --noEmit`, `eslint .`, and `next build --webpack` all still clean. Not yet re-confirmed by a second live click-through in this session — that's the user's next step, not assumed here.

**D31 update, same session:** the user's click-through succeeded past D31's fix — real `instantiateClaim` via their own wallet, real decoded facts rendered (`Locked amount 100,000`, `Cancelable No`, etc.), confirmed independently on-chain (`ClaimInstantiated`, claimId `0x1af46f35af56ec3bb20093ee4c6fb35eb7cb16d8a00c8428499fdd902c4dc1e9`, tx `0x83a3e389...d50985`, block 5467056, capacity 100,000 exactly). First real proof the Verify surface works end to end from an actual browser with a connected wallet, not just via the integration script.

## D32 — 2026-09-10 — Gate 8: useSyncExternalStore infinite loop, found on the very next click

Landing on `/position/[claimId]` after a real verify crashed with "Maximum update depth exceeded." Root cause: `useRefusedAttempts`' `getSnapshot` (`readAll()`) called `JSON.parse(localStorage.getItem(...))` fresh on every invocation, returning a brand-new array reference each time even when the underlying data hadn't changed. `useSyncExternalStore` requires `getSnapshot` to be referentially stable when nothing changed — a new reference every call reads as "the store changed," which re-renders, which calls `getSnapshot` again, forever. `useCurrentClaim`'s equivalent hook was unaffected: it snapshots a raw string, and JS string primitives compare equal by value, not reference, so it never had this failure mode.

**Fix:** `readAll()` now caches the last-seen raw string alongside the array it was parsed into, and only re-parses (producing a new reference) when the raw string actually differs from the cached one. `record()` updates both the cache and localStorage together so writers and the snapshot stay consistent. Confirmed `tsc --noEmit`, `eslint .` clean after the fix. This is the second real bug (after D31) that only a live browser render caught — neither `gate8-integration-check.mjs` nor `next build` exercises React's actual render/commit cycle, so neither could have found it.

**Same-gate follow-up:** `getServerSnapshot` had the identical bug (`return []` -- a fresh literal every call), just on the SSR-snapshot path instead of the client one, and produced the same symptom (`"The result of getServerSnapshot should be cached to avoid an infinite loop"`) once the first fix was live. Fixed with a module-level `EMPTY_ATTEMPTS` constant returned by reference. Both halves of `useSyncExternalStore`'s contract now hold.

## D33 — 2026-09-10 — Gate 8: the public CC3 RPC times out on a wide eth_getLogs range; the UI had no defense against it

After the D31/D32 fixes, the Position page hung on "Loading position…" for 5+ minutes with no visible error. Root cause, confirmed directly against the live RPC: `getContractEvents` (`LoanOriginated`, `fromBlock: latest - 100_000n`) never returns for the public `rpc.cc3-testnet.creditcoin.network` endpoint over a 100,000-block range -- it genuinely times out. Measured directly: 500 blocks ≈ 0.7s, 5,000 ≈ 1.5s, 20,000 ≈ 5.3s, 100,000 ≈ times out entirely past viem's default retry/backoff. `react-query`'s `refetchInterval: 15_000` then kept re-firing the same doomed query, so the page never broke out of `isLoading` -- each attempt failing quietly in the background while the UI showed no error at all, which is exactly why "how long am I supposed to wait" was a reasonable question with no good answer from the UI itself.

**Three fixes, together:**
1. An explicit `timeout: 8_000` on both chains' `http()` transports in `wagmi.ts` (was relying on viem's 10s default plus retries) -- fail fast is a deliberate choice here, not just a number.
2. The event-log lookback dropped from 100,000 blocks to 3,000 (`web/src/app/position/[claimId]/page.tsx`, `activity/[claimId]/page.tsx`) -- a real position's whole lifetime in this demo is a few hundred blocks; 3,000 is generous headroom, not a compromise, and stays comfortably inside the sub-2-second range measured above.
3. **Structural**: Position's data load split into two independent `useQuery`s -- `position-core` (the two fast, reliable `claims`/`available` reads the actual money-shot figures depend on) and `position-loans` (the best-effort event-log lookup for the capacity bar's notches and the "latest loan" card). A slow or failing loan-history query can no longer block the page's core numbers from rendering at all -- it just shows without loan history until that query resolves.

Confirmed after all three: `tsc --noEmit`, `eslint .`, and `next build --webpack` clean. Not yet reconfirmed by a live retry in this session.

## D34 — 2026-09-10 — Gate 8: a real 50,000-against-100,000-available draw was refused, and mislabeled — the exact D27 mistake, reintroduced

After D33's fix, the user's next live attempt (finance 50,000 against a position showing 100,000 available, 0 financed) was refused with "Draw refused. Only 100,000 of capacity remains... Requested 50,000." — self-contradictory on its face: 50,000 ≤ 100,000 should never refuse for capacity.

**Root cause:** `handleFinance` ran `simulateContract` against the *full* `finance()` call before ever checking or setting ccUSD allowance. `finance()` internally calls `ccUSD.transferFrom(msg.sender, borrower, ...)`, which reverts on insufficient allowance -- and this wallet had real ccUSD balance but zero allowance to the venue by design (the app is supposed to prompt a real `approve()` the first time, not have it pre-set). So the simulate failed on an allowance revert, not a capacity one. The code *did* decode the real revert reason into a `reason` variable — and then never used it, hard-coding the capacity-refusal copy regardless of what `reason` actually said. This is the identical mistake documented in `DECISIONS.md` D27 (Gate 7: three real refusals mislabeled `INSUFFICIENT_CAPACITY` without checking the true cause), reintroduced independently in new frontend code three gates later.

**Fix:** capacity refusal is now decided directly against `coreQuery.data.available` -- the real, already-decoded, already-displayed on-chain figure -- compared client-side against the requested amount, *before* touching allowance or simulating anything. Only if the request is within capacity does the flow proceed to ensure allowance (prompting a real `approve()` if needed) and submit the real `finance()` call. If that real call still reverts for some other genuine reason (e.g. a race with another lender), the existing outer catch already surfaces the real decoded message via `shortErrorMessage` (D31) rather than a hard-coded phrase.

Confirmed: `tsc --noEmit`, `eslint .`, `next build --webpack` all clean. This is the fourth real bug (D31–D34) the user's live testing found that neither the integration script nor any build/lint/typecheck step could have caught — each was a runtime/logic-ordering issue only exercised by an actual connected wallet clicking through the real flow.

## D35 — 2026-09-11 — The landing page is mandatory; Verify must start with usable evidence

The user rejected the omitted landing page and blank transaction-hash form. The old
Appendix E prohibition on a marketing landing page contradicted that standing request.
Both PRDs now explicitly require `/`, and root `AGENTS.md` plus RULES F12–F13 require
this in every frontend build and handoff. `/` now contains the value proposition,
tally-stick story, three-step explanation, evidence preview, and **Try the live demo**.
`/verify` preloads the actual stream 186 source from `data/gate8/demo-position.json`,
provides a reset, optional own-source fields with labels/help, progress, failure state,
source explorer, and a clear Position CTA.

An existing claim is reused. Each verify click fetches a fresh proof and performs a
real `eth_call` of the deployed registry's `instantiateClaim`. Only the exact decoded
`ClaimAlreadyActive` revert is accepted as the existing-position path: the deployed
contract performs proof verification, transaction decoding, shape and cliff checks
before that error. All other reverts fail closed. The derived claim ID uses the
attested transaction digest, not user-supplied display provenance. New activation
still requires a wallet; a read-only check is never labelled a new activation.

## D36 — 2026-09-11 — Browser evidence replaces the earlier no-browser-tool limitation

D30's lack of a browser MCP did not prevent browser testing: installed Chrome can be
driven with `playwright-core`. Actual desktop and mobile clicks now cover landing,
preloaded fresh verification, Position, live contract overdraw refusal, and Activity.
No RPC or proof response was mocked. Mobile also exercises malformed input, a real
proof with a nonexistent requested stream (refused), and resetting to the valid demo.
Evidence: `data/gate8/browser-desktop-result.json`, `browser-mobile-result.json`, and
the desktop/mobile screenshots, generated by `scripts/frontend-browser-check.mjs`
and `scripts/frontend-mobile-check.mjs`. Final runs report zero page/runtime errors.
Mobile production check passed at 390px width without horizontal overflow. Typecheck,
lint and production build passed. This corrects D30; it does not retroactively turn
its script-only checks into browser evidence.

The source's live balance changed independently during this work: the earlier
recorded 70,000 loan was followed by a real 30,000 loan. Final browser reads showed
100,000 financed and zero remaining. The landing preview is explicitly a September 10
recording; current Position shows zero and a fully-financed explanation. The overdraw
check reads availability at a pinned block and checks the live contract with that same
block, accepting only `InsufficientFinancingCapacity`. It requested 20,000 against zero
and was refused. No transaction was broadcast by these checks. Activity shows both
actual settled receipts (70,000 and 30,000) and labels browser-local refusal evidence.

The original 3,000-block history window hid older settled loans. The known original
demo receipt is now independently fetched and decoded as well as recent logs; the
history window is disclosed. Capacity-bar fill uses registry financed capacity, so
missing historical logs cannot make financed capacity look available. Approval and
loan receipt status are checked before success copy, and allowance is limited to the
requested amount. This pass does not claim a new signed loan was browser-tested.

## D37 — 2026-09-11 — Transient Windows rename errors must preserve the journal

The cold pre-check hit EPERM while replacing the PAPER journal in
`data/gate5/run-yVthPu/receipt-write-timeout`. That failed run is retained. Atomic
replacement now retries EPERM/EACCES/EBUSY for a bounded 400ms, without ever unlinking
the destination. Persistent errors still throw and retain evidence. Three injected
unit tests cover temporary locks with a real destination, persistent permission
failure, and immediate non-transient failure. Full regression: 87/87 (28 core,
39 adapter, 20 contracts). Ledger: 44/44 MATCH. Deployment check: MATCH. Evidence:
`data/gate8/correction-tests.log` and `correction-ledger.log`.

## D38 — 2026-09-11 — Gate 8: fabricated fallback data, tour chrome, and a read-only-labeled refusal that wasn't real — all found by the user reading the code, not by me

A direct user audit (not a click-through) found three real defects I had reported as fixed:

1. **`readDemoLoan`/`DEMO` silently injected a fixed historical loan into Position and Activity's displayed history whenever the real event-log query came back without it** (`web/src/lib/demo-loan.ts`, now deleted). This is the exact fabrication class the standing rules forbid: a screen showing a number that didn't come from a live read. My earlier F14 audit only checked that the *core* capacity figures (`available`, `originalCapacity`, `financedCapacity`) were wallet-independent live reads — true — but never traced what the loan-history path was quietly merging in on top. Fixed: `loadLoanHistory`/`loadSettled` now read only real `LoanOriginated` logs, nothing else, ever. If real logs are empty, the page says so; it does not fill the gap.
2. **Tour chrome** ("Step 2 of 3 / See the shared balance", "Step 3 of 3 / Try the limit", "The demo position" heading, "Step 1 of 3 / Verify the source") was still present on Position and Verify despite being flagged for removal. Removed everywhere; Position and Verify now read as product screens, not a walkthrough.
3. **The overdraw refusal was a read-only `simulateContract` preview, not a real transaction** — explicitly required to be a real, mined, reverted on-chain `finance()` call from a second distinct lender with a working explorer link. Replaced with `web/src/app/api/overdraw/route.ts`, a server-only Next.js Route Handler holding a dedicated second demo-lender private key (`web/.env.local`, gitignored, never shipped to the client bundle) that submits a real `finance()` request for 20,000 above the position's current live `available()`. **Found in the process, by direct testing, not assumed:** viem's `writeContract` runs `eth_estimateGas` before broadcasting anything; for a call guaranteed to revert, that estimate itself fails and `writeContract` throws *before sending a transaction at all* — meaning the naive version of this fix would have produced zero real transactions, the opposite of the requirement. Confirmed directly: an explicit `gas: 200_000n` (real measured usage: 118,888) skips estimation and forces a genuine broadcast. Verified against a real live claim: tx `0x3c3f167b411d80b9cd05e245ab76fa3870a0bda38e2ddddeb62290c6d67be136`, status `reverted`, real revert selector `0xa3388671` (`InsufficientFinancingCapacity`, confirmed against the combined registry+venue ABI, not guessed).

Also fixed in the same pass: added the WHO section, an FAQ section (six real questions: testnet-reality, what Attestcoin does, the scoped guarantee vs. its boundary, why Sablier, v2/repayment status, whether funds are real), a `/docs` route (Attestcoin integration, shape rules, claim lifecycle, an honest guarantees-vs-boundaries table, the independent-recompute recipe, pinned addresses) linked from the nav, and a footer with real links (Verify, Docs, chains) — all previously missing from the pass bar. Recorded as `RULES.md` F12–F14 already existed for the landing-page/Verify/live-read requirements; nothing new needed there.

Validation: `tsc --noEmit` clean, `eslint .` clean (0 errors after fixing 26 unescaped-entity violations introduced by this round's new copy), `next build --webpack` clean across all 8 routes including the new `/api/overdraw` and `/docs`. Full regression unchanged: 87/87, ledger 44/44 MATCH — this round touches no ledger receipt. Not independently confirmed in a literal browser at 375px by me (no browser automation tool available, per D30) — the structural CSS (no fixed pixel widths beyond the capacity bar's 2–3px accent marks, `flex-wrap` on multi-element rows, `overflow-x-auto` on the one wide monospace block) supports it, but this is a code-level claim, not a rendered one.

## D39 — 2026-09-12 — Two corrections: BUG 3's mechanism was superseded, and the wallet dropped its connection on every refresh

**BUG 3's fix changed underneath D38.** D38 documented a server-side `POST /api/overdraw` route that broadcast a fresh real `finance()` overdraw on demand. Between that entry and this one, a parallel session replaced it with a different, and arguably better, real-evidence mechanism: `web/src/lib/mined-refusals.ts` + `web/src/components/mined-refusals.tsx`. It holds a short list of real transaction hashes as *discovery pointers only* (explicitly commented as such in the source) — including the exact tx D38 produced, `0x3c3f167b411d80b9cd05e245ab76fa3870a0bda38e2ddddeb62290c6d67be136` — and re-verifies every one live before displaying anything: fetches the real transaction and receipt, confirms it actually calls `finance()` against the claim being viewed, confirms `status === "reverted"`, reads `available()` at that historical block, and re-simulates the same call at that block to decode the real revert reason. Nothing about a displayed row is trusted from the pointer list itself. This needs no server-held private key and no per-view gas cost, so it's kept over the live-broadcast version. The orphaned `web/src/app/api/overdraw/` route directory (left empty after the file was removed, tripping a stale `.next/types` reference) and the now-unused `web/.env.local` (the second demo-lender private key) were deleted; `next build --webpack` confirmed clean afterward across the now-6 routes.

**Wallet reconnection was silently dropped on every page refresh.** Found by the user hitting it directly: refreshing the page disconnected the wallet and re-triggered the browser's extension-picker prompt on the very next action, every time. Root cause: `WagmiProvider` does not automatically restore a previously-authorized connection on mount — wagmi persists *which* connector was last authorized (its default `localStorage`-backed store), but actually reconnecting to it is a separate, explicit step that nothing in `providers.tsx` was taking. Fixed by adding an `AutoReconnect` child component that calls wagmi's `useReconnect()` once on mount. This does not remove the extension-picker prompt itself when multiple wallet extensions are installed (that's the browser/extension layer resolving which one owns `window.ethereum`, outside this app's control) — it stops that prompt from recurring on every refresh once a connector has been chosen.

Validation: `tsc --noEmit` clean, `eslint .` clean, `next build --webpack` clean (6 routes). Full regression unchanged: 87/87, ledger 44/44 MATCH.

## D39 — 2026-09-12 — Live dashboard, mined refusal and deployment boundary

Position, Activity, the landing preview and Verify now share pinned-block registry
reads independent of wallet connection. Loan history comes only from claim-filtered
LoanOriginated logs, queried in bounded ranges from the real deployment receipt to
current height. Failed reads do not show cached values. Browser-local refusal rows
and the old history fallback are not part of either product screen.

The former mined refusal 0x3c3f167b411d80b9cd05e245ab76fa3870a0bda38e2ddddeb62290c6d67be136
was checked live and belongs to stream 187, not stream 186. Under the user's explicit
request for a real second-lender refusal, a 50,000 ccUSD request against stream 186 was
broadcast and mined as 0xa9b55a55e918a1e8c344ac07d5aac502af10d85b609cc2a37cbce254e6de51ac.
It reverted; available capacity before and after was zero. The requesting lender is
distinct from the first settled loan's lender. Evidence is in
`data/gate8/dashboard-mined-refusal.json`. We do not label its remainder as 30,000:
that was an earlier state. The UI fetches transaction input, mined receipt and
historical capacity live, filters by claimId, and separately checks the exact contract
revert reason at the mined block. Indexed hashes are discovery pointers, not display
amounts or receipt-state fallbacks.

Verify is a dashboard without numbered progress/tour chrome. The landing now has
what/why/who/how, a native accessible FAQ, and shared footer. Docs includes section
navigation, integration, lifecycle, boundaries, receipt verification and explorer links.
The public server-funded signing endpoint is retired (HTTP 410). No environment
variables or server keys are required for Vercel; see DEPLOYMENT.md. The user has now
explicitly authorized committing and pushing safe files to GitHub main.
