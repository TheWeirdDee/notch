// Recorded Gate 9 FIX 3 evidence: data/gate8/demo-position-fix3.json and fix3-result.json.
// Stream 186 (the original demo position) had a real, on-chain enforced cliff that
// expired 2026-09-12 11:16:50 UTC -- this is a fresh, rule-compliant replacement with a
// 30-day cliff, comfortably past the submission window. Stream 186's receipts and prior
// documentation remain valid historical evidence; nothing about them was rewritten, this
// is a pointer update, not a correction to what already happened.
export const DEMO = {
  sourceTx: "0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa",
  streamId: "189",
  claimId: "0x3fed0d1620134bb777847debb9f2bb9f7c455668f67b03c780f0f6896c0a0a48",
  financeTx: "0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978",
} as const;
