// Gate 1 prerequisite: deploy NotchDemoAsset on Sepolia, mint to the burner wallet, so
// there is a real ERC-20 to deposit into the Sablier stream. Address is recorded to
// .env as SEPOLIA_DEMO_ASSET and to DECISIONS.md as the approvedDemoAsset for Gate 3.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { compileSolidityFile } from "./lib/compile.mjs";
import { fileURLToPath } from "node:url";

const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

if (!PRIVATE_KEY) {
  console.error("Missing SEPOLIA_PRIVATE_KEY in .env. Run scripts/generate-wallets.mjs first.");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sepolia balance for ${account.address}: ${formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error("Wallet has no Sepolia ETH. Fund it from a faucet, then re-run.");
  process.exit(1);
}

const contractPath = fileURLToPath(new URL("../contracts/src/NotchDemoAsset.sol", import.meta.url));
const { abi, bytecode } = compileSolidityFile(contractPath);

console.log("Deploying NotchDemoAsset...");
const deployHash = await walletClient.deployContract({ abi, bytecode, args: [] });
console.log("Deploy tx:", deployHash);
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const tokenAddress = deployReceipt.contractAddress;
console.log("NotchDemoAsset deployed at:", tokenAddress);

const mintAmount = 1_000_000n * 10n ** 18n; // 1,000,000 NDA, arbitrary demo supply
console.log(`Minting ${mintAmount} (raw) to ${account.address}...`);
const mintHash = await walletClient.writeContract({
  address: tokenAddress,
  abi,
  functionName: "mint",
  args: [account.address, mintAmount],
});
console.log("Mint tx:", mintHash);
await publicClient.waitForTransactionReceipt({ hash: mintHash });

console.log("\nDone. Add this to .env:");
console.log(`SEPOLIA_DEMO_ASSET=${tokenAddress}`);
