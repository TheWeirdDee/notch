// Gate 8: exercises the EXACT same call sequence the built UI performs (fetch fresh
// proof -> instantiateClaim -> finance -> a refused finance) against the real Gate 8 demo
// position, using burner keys instead of a browser wallet since no browser automation
// tool is available in this environment. This is NOT a substitute for a human clicking
// through the actual UI -- it proves the underlying on-chain logic is correct and
// produces the real money-shot state (100,000 -> 70,000 financed -> 30,000 available,
// then a refused 50,000 request), matching Notch-PRD v2.md Appendix E exactly.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, pad, toHex, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const VENUE_ADDRESS = process.env.VENUE_ADDRESS;

const publicClient = createPublicClient({ transport: http(RPC_URL) });
function clientFor(pk) {
  const account = privateKeyToAccount(pk);
  return { account, wallet: createWalletClient({ account, transport: http(RPC_URL) }) };
}

const { abi: registryAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));
const { abi: venueAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));

const demoPosition = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate8/demo-position.json", import.meta.url)), "utf8"));
console.log(`Demo position: stream ${demoPosition.streamId}, deposit ${demoPosition.depositAmountHuman}`);

// 1. Verify -- fetch a fresh proof (D12/D26), then instantiateClaim for real.
async function fetchFreshProof(chainKey, txHash) {
  const API = "https://proof-gen-api.cc3-testnet.creditcoin.network";
  for (let attempt = 1; attempt <= 40; attempt++) {
    const attestedRes = await fetch(`${API}/api/v1/attested-height/${chainKey}`);
    const attestedBody = await attestedRes.json().catch(() => null);
    const attested = attestedBody?.attestedHeight != null ? BigInt(attestedBody.attestedHeight) : null;
    if (attested !== null && attested >= BigInt(demoPosition.blockNumber)) break;
    console.log(`  waiting for attestation: ${attested} / ${demoPosition.blockNumber}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  const res = await fetch(`${API}/api/v1/proof-by-tx/${chainKey}/${txHash}`);
  if (res.status !== 200) throw new Error(`proof-by-tx failed: ${res.status}`);
  const body = await res.json();
  const ageMs = Date.now() - Date.parse(body.generatedAt);
  console.log(`  fresh proof, age ${Math.round(ageMs / 1000)}s`);
  return body;
}

const { account: judge, wallet: judgeWallet } = clientFor(process.env.CC3_PRIVATE_KEY);
const proof = await fetchFreshProof(SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT, demoPosition.createTxHash);

const instArgs = [
  BigInt(proof.chainKey), BigInt(proof.headerNumber), proof.txBytes,
  demoPosition.createTxHash, BigInt(demoPosition.streamId), proof.merkleProof.root,
  proof.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
  proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots,
];

console.log("\n=== Verify (instantiateClaim) ===");
await publicClient.simulateContract({ account: judge, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args: instArgs });
const instHash = await judgeWallet.writeContract({ account: judge, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args: instArgs });
const instReceipt = await publicClient.waitForTransactionReceipt({ hash: instHash });
let claimId;
for (const log of instReceipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "ClaimInstantiated") claimId = decoded.args.claimId;
  } catch { /* skip */ }
}
console.log(`instantiate tx: ${instHash}`);
console.log(`claimId: ${claimId}`);

// 2. Finance -- Lender A draws 70,000.
console.log("\n=== Finance (Lender A, 70,000) ===");
const { account: lenderA, wallet: lenderAWallet } = clientFor(process.env.LENDER_A_PRIVATE_KEY);
const amountA = 70000n * 10n ** 18n;
const actionKeyA = pad(toHex(Date.now()), { size: 32 });
await publicClient.simulateContract({ account: lenderA, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKeyA, claimId, amountA] });
const financeHashA = await lenderAWallet.writeContract({ account: lenderA, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKeyA, claimId, amountA] });
await publicClient.waitForTransactionReceipt({ hash: financeHashA });
console.log(`finance tx (Lender A, 70,000): ${financeHashA}`);

const available1 = await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [claimId] });
console.log(`available after: ${available1} (${available1 / 10n ** 18n} human)`);

// 3. See refusal -- Lender B attempts 50,000, only 30,000 remains.
console.log("\n=== See refusal (Lender B, 50,000 requested, 30,000 available) ===");
const { account: lenderB } = clientFor(process.env.LENDER_B_PRIVATE_KEY);
const amountB = 50000n * 10n ** 18n;
const actionKeyB = pad(toHex(Date.now() + 1), { size: 32 });
let refusalReason = "UNEXPECTED_SUCCESS";
try {
  await publicClient.simulateContract({ account: lenderB, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKeyB, claimId, amountB] });
} catch (err) {
  refusalReason = err.cause?.data?.errorName ?? err.shortMessage ?? String(err);
}
console.log(`refusal reason (real simulateContract against live state): ${refusalReason}`);

const finalState = await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "claims", args: [claimId] });
const result = {
  claimId,
  instantiateTx: instHash,
  financeTxLenderA: financeHashA,
  refusalReason,
  originalCapacity: finalState[7].toString(),
  financedCapacity: finalState[8].toString(),
  available: available1.toString(),
  recordedAt: new Date().toISOString(),
};
writeFileSync(fileURLToPath(new URL("../data/gate8/integration-check-result.json", import.meta.url)), JSON.stringify(result, null, 2));
console.log("\nWritten to data/gate8/integration-check-result.json");
console.log(JSON.stringify(result, null, 2));
