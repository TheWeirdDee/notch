import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Gate 3: deploy MockUSDC, AttestedCashflowRegistry, CashflowLendingVenue on CC3
// Testnet, then wire the registry to its venue (one-time bootstrap). Uses the same
// CC3 burner wallet as Gate 1 (deployer role).
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { CC3_DECODER_CONTRACT } from "./lib/constants.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const APPROVED_DEMO_ASSET = process.env.SEPOLIA_DEMO_ASSET;

if (!PRIVATE_KEY) {
  console.error("Missing CC3_PRIVATE_KEY in .env.");
  process.exit(1);
}
if (!APPROVED_DEMO_ASSET) {
  console.error("Missing SEPOLIA_DEMO_ASSET in .env.");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`CC3 balance for ${account.address}: ${formatEther(balance)} CTC`);

async function deploy(name, args = []) {
  const contractPath = fileURLToPath(new URL(`../contracts/src/${name}.sol`, import.meta.url));
  const { abi, bytecode } = compileSolidityFile(contractPath);
  console.log(`Deploying ${name}...`);
  const hash = await walletClient.deployContract({ account, abi, bytecode, args });
  console.log(`  tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  deployed at: ${receipt.contractAddress} (status: ${receipt.status})`);
  return { address: receipt.contractAddress, abi, deployTx: hash };
}

const mockUSDC = await deploy("MockUSDC");
const registry = await deploy("AttestedCashflowRegistry", [CC3_DECODER_CONTRACT, APPROVED_DEMO_ASSET]);
const venue = await deploy("CashflowLendingVenue", [registry.address, mockUSDC.address]);

console.log("Wiring registry.setVenue(venue)...");
const setVenueHash = await walletClient.writeContract({
  account,
  address: registry.address,
  abi: registry.abi,
  functionName: "setVenue",
  args: [venue.address],
});
console.log("  tx:", setVenueHash);
const setVenueReceipt = await publicClient.waitForTransactionReceipt({ hash: setVenueHash });
console.log("  status:", setVenueReceipt.status);

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });

const deployment = {
  deployedAt: new Date().toISOString(),
  deployer: account.address,
  network: "creditcoin-cc3-testnet",
  contracts: {
    MockUSDC: { address: mockUSDC.address, deployTx: mockUSDC.deployTx },
    AttestedCashflowRegistry: {
      address: registry.address,
      deployTx: registry.deployTx,
      constructorArgs: { decoder: CC3_DECODER_CONTRACT, approvedDemoAsset: APPROVED_DEMO_ASSET },
    },
    CashflowLendingVenue: {
      address: venue.address,
      deployTx: venue.deployTx,
      constructorArgs: { registry: registry.address, ccUSD: mockUSDC.address },
    },
  },
  setVenueTx: setVenueHash,
};

writeFileSync(new URL("./deployment.json", `file://${outDir}/`), JSON.stringify(deployment, null, 2));
console.log("\nWritten to data/gate3/deployment.json");

console.log("\nAdd to .env:");
console.log(`MOCK_USDC_ADDRESS=${mockUSDC.address}`);
console.log(`REGISTRY_ADDRESS=${registry.address}`);
console.log(`VENUE_ADDRESS=${venue.address}`);
