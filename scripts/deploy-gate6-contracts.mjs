import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 6, step 1: deploy the FIXED contracts (Gate 5 remediation: exact-settlement
// decimals, permanently-immutable venue self-deployed by the registry, on-chain
// actionKey idempotency, ClaimExpired/TransferableNotAllowed checks, explicit
// requestedStreamId). Old Gate 3/4 addresses are preserved under GATE3_* in .env, not
// overwritten -- the 10 PAPER receipts stay valid against them.
import "dotenv/config";
if (!process.argv.includes("--broadcast")) throw new Error("Deployment requires an explicit --broadcast invocation after user authorization.");
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync as nativeWriteFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { CC3_DECODER_CONTRACT } from "./lib/constants.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const APPROVED_DEMO_ASSET = process.env.SEPOLIA_DEMO_ASSET;
const DEPOSIT_ASSET_DECIMALS = 18; // NotchDemoAsset.sol

if (!PRIVATE_KEY || !APPROVED_DEMO_ASSET) {
  console.error("Missing CC3_PRIVATE_KEY or SEPOLIA_DEMO_ASSET in .env.");
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
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);
  console.log(`  deployed at: ${receipt.contractAddress} (status: ${receipt.status})`);
  return { address: receipt.contractAddress, abi, deployTx: hash };
}

const mockUSDC = await deploy("MockUSDC");

console.log("Deploying AttestedCashflowRegistry (self-deploys its immutable venue in the constructor)...");
const registry = await deploy("AttestedCashflowRegistry", [
  CC3_DECODER_CONTRACT,
  APPROVED_DEMO_ASSET,
  mockUSDC.address,
  DEPOSIT_ASSET_DECIMALS,
]);

const venueAddress = await publicClient.readContract({
  address: registry.address,
  abi: registry.abi,
  functionName: "venue",
});
console.log("Registry-deployed venue address:", venueAddress);

const { abi: venueAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));

const outDir = fileURLToPath(new URL("../data/gate6", import.meta.url));
mkdirSync(outDir, { recursive: true });

const deployment = {
  deployedAt: new Date().toISOString(),
  deployer: account.address,
  network: "creditcoin-cc3-testnet",
  supersedes: {
    MockUSDC: process.env.GATE3_MOCK_USDC_ADDRESS,
    AttestedCashflowRegistry: process.env.GATE3_REGISTRY_ADDRESS,
    CashflowLendingVenue: process.env.GATE3_VENUE_ADDRESS,
    claimId: process.env.GATE3_CLAIM_ID,
  },
  contracts: {
    MockUSDC: { address: mockUSDC.address, deployTx: mockUSDC.deployTx },
    AttestedCashflowRegistry: {
      address: registry.address,
      deployTx: registry.deployTx,
      constructorArgs: {
        decoder: CC3_DECODER_CONTRACT,
        approvedDemoAsset: APPROVED_DEMO_ASSET,
        ccUSD: mockUSDC.address,
        depositAssetDecimals: DEPOSIT_ASSET_DECIMALS,
      },
    },
    CashflowLendingVenue: {
      address: venueAddress,
      note: "Self-deployed by the registry's constructor, not a separate deployContract call.",
    },
  },
};

writeFileSync(new URL("./deployment.json", `file://${outDir}/`), JSON.stringify(deployment, null, 2));
writeFileSync(new URL("../deployments/current.json", `file://${outDir}/`), JSON.stringify({ ...deployment, rulesVersion: 2 }, null, 2));
console.log("\nWritten to data/gate6/deployment.json");

// Update .env: current (Gate 6) addresses, GATE3_* left untouched above.
const envPath = fileURLToPath(new URL("../.env", import.meta.url));
let env = readFileSync(envPath, "utf8");
env = env.replace(/^MOCK_USDC_ADDRESS=.*$/m, "").replace(/^REGISTRY_ADDRESS=.*$/m, "").replace(/^VENUE_ADDRESS=.*$/m, "").replace(/^CLAIM_ID=.*$/m, "");
env += `\nMOCK_USDC_ADDRESS=${mockUSDC.address}\nREGISTRY_ADDRESS=${registry.address}\nVENUE_ADDRESS=${venueAddress}\n`;
writeFileSync(envPath, env);
console.log("\n.env updated with Gate 6 (current) addresses. GATE3_* preserved separately.");
