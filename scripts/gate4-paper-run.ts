// Gate 4: exercise J1-J4 in PAPER mode against LIVE proofs. Real Attestcoin proof, real
// on-chain verification, real reference-model math; only the disbursement leg is
// simulated and labelled. Writes one receipt per action to the append-only ledger.
// Per DECISIONS.md D12, every proof used here is freshly fetched, never replayed from a
// saved file.
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import {
  makePublicClient,
  assembleFreshProof,
  verifyOnChain,
  buildReceipt,
  appendReceipt,
  type FetchedProof,
} from "../adapter/src/index.js";
import { instantiate, apply, available, type Claim, type Proof, type Loan } from "../core/src/index.js";

const account = privateKeyToAccount(process.env.CC3_PRIVATE_KEY as `0x${string}`);
const client = makePublicClient(process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network");

const LENDER_A = process.env.LENDER_A_ADDRESS!;
const LENDER_B = process.env.LENDER_B_ADDRESS!;
const LENDER_C = "0x00000000000000000000000000000000000000C3"; // synthetic, paper-mode-only third lender

function proofInputsFrom(fetched: FetchedProof, proof: Proof) {
  return {
    chainKey: fetched.chainKey,
    headerNumber: fetched.response.headerNumber,
    txHash: fetched.txHash,
    rawProofPayloadHash: fetched.rawPayloadHash,
    decodedProof: proof,
  };
}

const receiptIds: { label: string; id: string; status: string }[] = [];

async function record(label: string, receipt: ReturnType<typeof buildReceipt>) {
  await appendReceipt(receipt);
  receiptIds.push({ label, id: receipt.receipt_id, status: receipt.refused ? `REFUSED (${receipt.reason_code})` : "OK" });
  console.log(`[${label}] receipt ${receipt.receipt_id} -- ${receipt.refused ? `REFUSED: ${receipt.reason_code}` : "ok"}`);
}

console.log("=== J1: verify + finance (real Gate 1 stream) ===");
const GATE1_TX = "0x9d3a408bccf1f1a6fe14fd7493dc379b064cf058956a898bf394dfb0df380cc8";
const GATE1_BLOCK = "11666803";

const j1 = await assembleFreshProof(client, account.address, 1, GATE1_TX, GATE1_BLOCK, {
  onPoll: (h) => console.log(`  waiting for attestation... current: ${h}`),
});
console.log("  fetched fresh proof, generatedAt:", j1.fetched.response.generatedAt, "cached:", j1.fetched.response.cached);

const instResult1 = instantiate(j1.proof, null);
if (!instResult1.ok) throw new Error(`J1 instantiate unexpectedly refused: ${instResult1.reason}`);
let claim0: Claim = instResult1.claim;
await record(
  "J1-instantiate",
  buildReceipt({
    mode: "PAPER",
    action: "instantiate",
    claim_id: claim0.claimId,
    proof_inputs: proofInputsFrom(j1.fetched, j1.proof),
    claim_before: null,
    claim_after: claim0,
    capacity_before: null,
    capacity_after: available(claim0).toString(),
    lender: null,
    amount: null,
    fill: null,
    refused: false,
    reason_code: null,
    limitations: null,
  })
);

async function financeStep(label: string, claimBefore: Claim, lender: string, amountUnits: bigint, proofInputs: ReturnType<typeof proofInputsFrom>) {
  const loan: Loan = { lender, amount: amountUnits.toString(), viaAuthorizedVenue: true, transferWouldSucceed: true };
  const capacityBefore = available(claimBefore).toString();
  const result = apply(loan, claimBefore);
  if (result.ok) {
    await record(
      label,
      buildReceipt({
        mode: "PAPER",
        action: "finance",
        claim_id: claimBefore.claimId,
        proof_inputs: proofInputs,
        claim_before: claimBefore,
        claim_after: result.claim,
        capacity_before: capacityBefore,
        capacity_after: available(result.claim).toString(),
        lender,
        amount: amountUnits.toString(),
        fill: null,
        refused: false,
        reason_code: null,
        limitations:
          "PAPER mode: the Attestcoin proof, on-chain verification, and capacity math above are real. The ccUSD disbursement is simulated, not an on-chain transfer, and is excluded from LIVE totals.",
      })
    );
    return result.claim;
  } else {
    await record(
      label,
      buildReceipt({
        mode: "PAPER",
        action: "finance",
        claim_id: claimBefore.claimId,
        proof_inputs: proofInputs,
        claim_before: claimBefore,
        claim_after: null,
        capacity_before: capacityBefore,
        capacity_after: null,
        lender,
        amount: amountUnits.toString(),
        fill: null,
        refused: true,
        reason_code: result.reason,
        limitations: null,
      })
    );
    return claimBefore;
  }
}

const CAP_UNIT = 10n ** 18n;
const j1ProofInputs = proofInputsFrom(j1.fetched, j1.proof);

let claim1 = await financeStep("J1-finance-lenderA-70000", claim0, LENDER_A, 70_000n * CAP_UNIT, j1ProofInputs);

console.log("\n=== J2: second lender refused ===");
claim1 = await financeStep("J2-finance-lenderB-50000-refused", claim1, LENDER_B, 50_000n * CAP_UNIT, j1ProofInputs);

console.log("\n=== bonus: a third independent lender succeeds on the residual ===");
let claim2 = await financeStep("bonus-finance-lenderC-5000", claim1, LENDER_C, 5_000n * CAP_UNIT, j1ProofInputs);

console.log("\n=== J3a: fake source refused (corrupted merkle proof) ===");
{
  const fetched = j1.fetched; // reuse the same fresh fetch's txBytes/continuity, corrupt only the merkle siblings
  const corruptedSiblings = fetched.response.merkleProof.siblings.map((s, i) =>
    i === 0 ? { hash: "0x" + "ab".repeat(32), isLeft: s.isLeft } : s
  );
  const verify = await verifyOnChain(client, account.address, {
    chainKey: BigInt(fetched.chainKey),
    height: BigInt(fetched.response.headerNumber),
    encodedTransaction: fetched.response.txBytes,
    merkleRoot: fetched.response.merkleProof.root,
    siblings: corruptedSiblings,
    lowerEndpointDigest: fetched.response.continuityProof.lowerEndpointDigest,
    continuityRoots: fetched.response.continuityProof.roots,
  });
  console.log("  real on-chain verify result with corrupted merkle proof:", verify);
  const fakeProof: Proof = { ...j1.proof, proofVerified: verify.proofVerified, precompileAvailable: verify.precompileAvailable };
  const result = instantiate(fakeProof, null);
  if (result.ok) throw new Error("J3a: fake proof unexpectedly instantiated a claim");
  await record(
    "J3a-instantiate-fake-merkle-refused",
    buildReceipt({
      mode: "PAPER",
      action: "instantiate",
      claim_id: "0x" + "f3".repeat(32),
      proof_inputs: proofInputsFrom(fetched, fakeProof),
      claim_before: null,
      claim_after: null,
      capacity_before: null,
      capacity_after: null,
      lender: null,
      amount: null,
      fill: null,
      refused: true,
      reason_code: result.reason,
      limitations: null,
    })
  );
}

console.log("\n=== J3b: wrong-shape source refused (real cancelable=true stream, stream 178) ===");
{
  const BAD_SHAPE_TX = "0x6cd2ae6e62c48e6fc971b1ffe0c76f4df6feb8c92c359466e608ef29e1de910d";
  const BAD_SHAPE_BLOCK = "11668046";
  const badShape = await assembleFreshProof(client, account.address, 1, BAD_SHAPE_TX, BAD_SHAPE_BLOCK, {
    onPoll: (h) => console.log(`  waiting for attestation... current: ${h}`),
  });
  console.log("  fetched fresh proof, generatedAt:", badShape.fetched.response.generatedAt);
  const result = instantiate(badShape.proof, null);
  if (result.ok) throw new Error("J3b: bad-shape stream unexpectedly instantiated a claim");
  await record(
    "J3b-instantiate-bad-shape-refused",
    buildReceipt({
      mode: "PAPER",
      action: "instantiate",
      claim_id: "0x" + "f3".repeat(32),
      proof_inputs: proofInputsFrom(badShape.fetched, badShape.proof),
      claim_before: null,
      claim_after: null,
      capacity_before: null,
      capacity_after: null,
      lender: null,
      amount: null,
      fill: null,
      refused: true,
      reason_code: result.reason,
      limitations: null,
    })
  );
}

console.log("\n=== J4: draw to exhaustion ===");
let claim3 = await financeStep("J4-finance-lenderA-10000", claim2, LENDER_A, 10_000n * CAP_UNIT, j1ProofInputs);
let claim4 = await financeStep("J4-finance-lenderB-10000", claim3, LENDER_B, 10_000n * CAP_UNIT, j1ProofInputs);
console.log("  remaining before final draw:", available(claim4).toString());
let claim5 = await financeStep("J4-finance-lenderC-exact-remainder", claim4, LENDER_C, available(claim4), j1ProofInputs);
console.log("  available after exhaustion:", available(claim5).toString());
await financeStep("J4-finance-post-exhaustion-refused", claim5, LENDER_A, 1n, j1ProofInputs);

console.log("\n=== Summary ===");
for (const r of receiptIds) console.log(`  ${r.label.padEnd(40)} ${r.id}  ${r.status}`);
console.log(`\n${receiptIds.length} receipts written to data/ledger.jsonl and data/receipts/`);

const sumFinanced = BigInt(claim5.financedCapacity);
const originalCapacity = BigInt(claim5.originalCapacity);
console.log(`\nConservation check: financedCapacity (${sumFinanced}) === originalCapacity (${originalCapacity}):`, sumFinanced === originalCapacity);
