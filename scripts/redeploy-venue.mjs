import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Redeploys only CashflowLendingVenue (decimals fix, take 2) against the already-
// deployed registry and MockUSDC, then rewires registry.setVenue -- now mutable, so
// this doesn't orphan the already-instantiated real claim.
import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS;
const DEPOSIT_ASSET_DECIMALS = 18; // NotchDemoAsset.sol -- fixed, known by the deployer

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

const { abi, bytecode } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));

console.log("Deploying fixed CashflowLendingVenue...");
const deployHash = await walletClient.deployContract({
  account,
  abi,
  bytecode,
  args: [REGISTRY_ADDRESS, MOCK_USDC_ADDRESS, DEPOSIT_ASSET_DECIMALS],
});
console.log("Deploy tx:", deployHash);
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const venueAddress = deployReceipt.contractAddress;
console.log("Venue deployed at:", venueAddress);

const { abi: registryAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));
console.log("Rewiring registry.setVenue(newVenue)...");
const setVenueHash = await walletClient.writeContract({
  account,
  address: REGISTRY_ADDRESS,
  abi: registryAbi,
  functionName: "setVenue",
  args: [venueAddress],
});
await publicClient.waitForTransactionReceipt({ hash: setVenueHash });
console.log("setVenue tx:", setVenueHash);

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
let env = readFileSync(envPath, "utf8");
env = env.replace(/^VENUE_ADDRESS=.*$/m, `VENUE_ADDRESS=${venueAddress}`);
writeFileSync(envPath, env);
console.log("\n.env updated with new VENUE_ADDRESS.");
