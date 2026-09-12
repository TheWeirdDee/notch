// Gate 7: freeze the set BEFORE looking at results. Locks in the 5 positions, 3
// lenders, the exact draw plan (as fractions of each position's own capacity, applied
// identically across all four ablations), and the scenario list -- then hashes the
// whole methodology. Committed to data/gate7/frozen-set.json and GATES.md before any
// finance scenario runs.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { keccak256, stringToBytes } from "viem";
import "dotenv/config";

const positions = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate7/positions/all-positions.json", import.meta.url)), "utf8"));

const frozenSet = {
  lockedAt: new Date().toISOString(),
  positions: positions.map((p) => ({
    positionIndex: p.positionIndex,
    streamId: p.streamId,
    createTxHash: p.createTxHash,
    depositAmountHuman: p.depositAmountHuman,
  })),
  lenders: {
    A: process.env.LENDER_A_ADDRESS,
    B: process.env.LENDER_B_ADDRESS,
    C: process.env.LENDER_C_ADDRESS,
  },
  drawPlanFractionsOfCapacity: [
    { step: 1, lender: "A", fraction: "0.7", note: "first draw" },
    { step: 2, lender: "B", fraction: "0.6", note: "second draw, over-request under full" },
    { step: 3, lender: "C", fraction: "0.5", note: "third draw, over-request under full" },
    { step: 4, lender: "A", fraction: "0.7", note: "new action (distinct actionKey), same amount as step 1 -- distinguishes per-lender ceiling (no_conservation) from no ceiling at all (single_lender_guard)" },
  ],
  note: "No literal actionKey-replay step: the pure reference model has no idempotency vocabulary (that's a Gate 5/D23 on-chain concern layered on top of it, already proven for real), so a replay receipt would have no model-producible reason code and would reintroduce the exact DRIFT class found and fixed in Gate 6 (D24). Revised before any finance scenario ran -- positions were already created on Sepolia at revision time, but no instantiate or finance call had happened.",
  scenariosPerPosition: [
    "sequential draws per drawPlanFractionsOfCapacity, ablation full: real on-chain",
    "sequential draws per drawPlanFractionsOfCapacity, ablations no_conservation/single_lender_guard: pure local computation over the same real decoded capacity and the same draw plan",
    "re-instantiation attempt (replay of instantiateClaim on the same real source)",
  ],
  setWideScenarios: [
    "one fake/wrong-shape source attempt, reused real proof from Gate 3 (cancelable=true stream), refetched fresh per D12",
    "user_supplied_amount ablation: one deliberately wrong typed amount compared against the real decoded depositAmount for one position, shown to disagree",
  ],
  ablations: ["full", "no_conservation", "single_lender_guard", "user_supplied_amount"],
  headlineFormula: "sum over positions of (total financed under no_conservation - capacity)",
};

const canonical = JSON.stringify(frozenSet, Object.keys(frozenSet).sort());
const hash = keccak256(stringToBytes(JSON.stringify(frozenSet)));

const withHash = { ...frozenSet, frozenSetHash: hash };
writeFileSync(fileURLToPath(new URL("../data/gate7/frozen-set.json", import.meta.url)), JSON.stringify(withHash, null, 2));

console.log("Frozen set hash:", hash);
console.log("Written to data/gate7/frozen-set.json");
console.log("\nLocked BEFORE any finance scenario has run. Positions instantiated on-chain yet: NO.");
