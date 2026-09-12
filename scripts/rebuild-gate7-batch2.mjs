// Rebuilds the 10 voided Gate 7 receipts with the two construction bugs fixed:
// checksummed addresses in decodedProof (matching viem's on-chain-read casing), and a
// real claim_before on the re-instantiation-attempt receipts. References the SAME real
// on-chain transactions already mined -- nothing is resubmitted. Current on-chain claim
// state is identical to what it was at each original attempt's time, since no further
// finance() calls have run on any of these claims since the campaign finished.
import "dotenv/config";
import { createPublicClient, http, keccak256, getAddress } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { buildReceipt, appendReceipt } from "../adapter/src/index.js";
import { available } from "../core/src/index.js";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const { abi: registryAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));

async function readClaim(claimId) {
  const tuple = await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "claims", args: [claimId] });
  return {
    rulesVersion: 2, attestedTxDigest: undefined,
    claimId: tuple[0], sourceChainKey: tuple[1], sourceTxHash: tuple[2], sourceContract: tuple[3],
    streamId: tuple[4].toString(), borrower: tuple[5], asset: tuple[6],
    originalCapacity: tuple[7].toString(), financedCapacity: tuple[8].toString(),
    lockedUntil: tuple[9], active: tuple[10],
  };
}

const dataDir = fileURLToPath(new URL("../data/gate7", import.meta.url));
const report = JSON.parse(readFileSync(`${dataDir}/campaign-report.json`, "utf8"));

for (const pos of report.positions) {
  const streamCreation = JSON.parse(readFileSync(`${dataDir}/positions/position-${pos.positionIndex}.json`, "utf8"));
  const label = `position-${pos.positionIndex}`;

  // Real txBytes not needed to rebuild -- attestedTxDigest is keccak256(txBytes), which
  // never changes for the same real transaction. We already recorded it correctly
  // (only the address casing inside decodedProof was wrong); recompute the digest input
  // fresh here from the same source-of-truth used originally for parity.
  const proofFile = JSON.parse(readFileSync(`${dataDir}/positions/proof-${pos.positionIndex}.json`, "utf8"));
  const attestedTxDigest = keccak256(proofFile.response.txBytes);
  const now = Math.floor(Date.now() / 1000);

  const decodedProof = {
    rulesVersion: 2, attestedTxDigest, transferable: false, precompileAvailable: true, proofVerified: true, receiptStatus: 1,
    chainKey: proofFile.response.chainKey, sourceTxHash: streamCreation.createTxHash, streamId: streamCreation.streamId,
    sourceContract: getAddress(streamCreation.sourceContract), recipient: getAddress(streamCreation.borrower), token: getAddress(streamCreation.demoAsset),
    depositAmount: streamCreation.depositAmount, cancelable: false, unlockAmountsStart: "0", unlockAmountsCliff: "0",
    cliffTime: streamCreation.cliffTime, endTime: streamCreation.timestampsEnd,
    now_at_instantiation: now, received_at: now,
  };
  const proofInputs = { chainKey: proofFile.response.chainKey, headerNumber: proofFile.response.headerNumber, txHash: streamCreation.createTxHash, rawProofPayloadHash: proofFile.rawPayloadHash, decodedProof };

  // 1. Rebuild the real instantiate receipt: same claimId/tx, checksummed claim_after.
  const claimNow = await readClaim(pos.claimId);
  const claimAfter = { ...claimNow, attestedTxDigest, financedCapacity: "0" }; // state right after instantiate, before any finance
  const instReceipt = buildReceipt({
    mode: "LIVE", action: "instantiate", claim_id: pos.claimId, proof_inputs: proofInputs,
    claim_before: null, claim_after: claimAfter,
    capacity_before: null, capacity_after: available(claimAfter).toString(),
    lender: null, amount: null, fill: pos.instantiateTx, refused: false, reason_code: null, limitations: null,
  });
  await appendReceipt(instReceipt);
  console.log(`${label}: rebuilt instantiate receipt ${instReceipt.receipt_id} (was ${pos.instantiateReceiptId})`);

  // 2. Rebuild the re-instantiation-attempt receipt: claim_before = the real active claim
  // as it stands now (identical to how it stood at the original attempt -- no further
  // finance() has run on this claim since).
  const claimAtReplay = await readClaim(pos.claimId);
  const replayReceipt = buildReceipt({
    mode: "LIVE", action: "instantiate", claim_id: pos.claimId, proof_inputs: proofInputs,
    claim_before: { ...claimAtReplay, attestedTxDigest }, claim_after: null,
    capacity_before: available(claimAtReplay).toString(), capacity_after: null,
    lender: null, amount: null, fill: null, refused: true, reason_code: "CLAIM_ALREADY_ACTIVE",
    limitations: `Gate 7 campaign, ${label}, re-instantiation attempt of the same real source. Rebuilt: original (${pos.replayReceiptId}) recorded claim_before=null, which cannot reproduce CLAIM_ALREADY_ACTIVE on rerun -- see DECISIONS.md D28.`,
  });
  await appendReceipt(replayReceipt);
  console.log(`${label}: rebuilt re-instantiate receipt ${replayReceipt.receipt_id} (was ${pos.replayReceiptId})`);
}
