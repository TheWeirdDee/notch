# Co-design question for #buidl-ctc-qna

Not posted by this session — no Discord/Slack access available. Draft below, ready to
post as-is or edited.

---

**Establishing proof freshness under Attestcoin's inclusion-only model**

We hit this empirically in Gate 1 and it's shaped a real operational rule in our build,
so flagging it as a genuine open question rather than something we think we've already
solved:

A proof fetched from ProofBuilder for a real Sepolia transaction was accepted by
BlockProver's `verifyAndEmit` at ~08:31 UTC. Refetching and resubmitting the *same*
transaction's proof at ~13:00 UTC was rejected — `"Continuity proof does not match
attestation or checkpoint"` — and the payload itself had materially changed in that
window: `continuityProof.roots` grew from 8 entries to 98 as the attested chain
advanced roughly 1,200 blocks. So a proof that was valid four and a half hours earlier
is not just "old," it's a structurally different object once the checkpoint moves past
it.

Our current rule, arrived at by observing this rather than from any documented
guarantee: **never hold a fetched proof — refetch immediately before every on-chain use,
every time**, and treat any proof older than a few minutes as untrustworthy without
re-verifying.

Given BlockProver proves inclusion at a point in time, not current chain state, the
question we don't have a good answer to: **is there a recommended or guaranteed
freshness window a consumer can rely on** (so "refetch immediately before use" could
relax to "refetch if older than X"), **or is empirically discovering it — as we did —
the intended integration pattern?** And separately: is there a lighter-weight way to
*extend* a continuity proof forward as the checkpoint advances, rather than a full
proof-by-tx refetch each time?

Context if useful: our registry contract (`AttestedCashflowRegistry`) consumes a
BlockProver proof once, at claim-instantiation time only — it doesn't need to re-verify
after that — so this affects our proof-fetching client, not our on-chain trust
assumptions. But for anyone building something that needs to re-verify a position
periodically (which we expect real receivables/credit use cases to), this seems like it
matters a lot more.
