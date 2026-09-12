import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Gate 3 parity: deploy MissingPrecompileProbe pointed at MockUSDC's address (a real
// deployed contract on CC3 that does not implement INativeQueryVerifier), and confirm
// calling verify() against it reverts -- the honest on-chain equivalent of "the
// precompile is unreachable" since the real BlockProver precompile can't be removed
// from CC3 Testnet to test this directly.
import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

const { abi, bytecode } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/MissingPrecompileProbe.sol", import.meta.url)));

console.log("Deploying MissingPrecompileProbe pointed at MockUSDC (not a verifier)...");
const deployHash = await walletClient.deployContract({ account, abi, bytecode, args: [MOCK_USDC_ADDRESS] });
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const probeAddress = deployReceipt.contractAddress;
console.log("Deployed at:", probeAddress);

const proof = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate1/attestcoin-proof.json", import.meta.url)), "utf8")).response;

const args = [
  BigInt(proof.chainKey),
  BigInt(proof.headerNumber),
  proof.txBytes,
  proof.merkleProof.root,
  proof.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
  proof.continuityProof.lowerEndpointDigest,
  proof.continuityProof.roots,
];

let result;
try {
  await publicClient.simulateContract({ account, address: probeAddress, abi, functionName: "verify", args });
  console.log("UNEXPECTED SUCCESS");
  result = { outcome: "UNEXPECTED_SUCCESS" };
} catch (err) {
  const reason = err.shortMessage ?? err.message;
  console.log("Reverted as expected:", reason);
  result = { outcome: "REVERTED", reason: String(reason) };
}

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("./missing-precompile-test.json", `file://${outDir}/`),
  JSON.stringify({ probeAddress, pointedAt: MOCK_USDC_ADDRESS, deployTx: deployHash, recordedAt: new Date().toISOString(), result }, null, 2)
);
console.log("\nWritten to data/gate3/missing-precompile-test.json");
if (result.outcome !== "REVERTED") process.exit(1);
