import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 3 / PRD v2 invariant 12: two demo lenders must be distinct funded wallets, one
// key acting as both is a hard fail. Generates two fresh burner keypairs, distinct from
// each other and from the CC3 deployer wallet, and funds each with CTC directly from
// the deployer (no faucet needed -- native CC3 transfer).
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { readFileSync, writeFileSync as nativeWriteFileSync, existsSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);
const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (existingEnv.includes("LENDER_A_PRIVATE_KEY=") && existingEnv.includes("LENDER_B_PRIVATE_KEY=")) {
  console.log("Lender wallets already generated in .env; not overwriting.");
  process.exit(0);
}

const lenderAKey = generatePrivateKey();
const lenderA = privateKeyToAccount(lenderAKey);
const lenderBKey = generatePrivateKey();
const lenderB = privateKeyToAccount(lenderBKey);

if (lenderA.address.toLowerCase() === lenderB.address.toLowerCase()) {
  throw new Error("Generated identical addresses -- regenerate.");
}

console.log("Lender A:", lenderA.address);
console.log("Lender B:", lenderB.address);

const deployerKey = process.env.CC3_PRIVATE_KEY;
const rpcUrl = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const deployer = privateKeyToAccount(deployerKey);
const publicClient = createPublicClient({ transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: deployer, transport: http(rpcUrl) });

const fundAmount = parseEther("2"); // 2 CTC each -- plenty for gas on a few calls

for (const [label, account] of [["Lender A", lenderA], ["Lender B", lenderB]]) {
  const hash = await walletClient.sendTransaction({ account: deployer, to: account.address, value: fundAmount });
  await publicClient.waitForTransactionReceipt({ hash });
  const bal = await publicClient.getBalance({ address: account.address });
  console.log(`Funded ${label} (${account.address}): ${formatEther(bal)} CTC, tx ${hash}`);
}

const appendix = `
# Gate 3 lender wallets -- distinct from each other and from the deployer, per PRD v2
# invariant 12. Funded with CC3 CTC directly from the deployer wallet.
LENDER_A_PRIVATE_KEY=${lenderAKey}
LENDER_A_ADDRESS=${lenderA.address}

LENDER_B_PRIVATE_KEY=${lenderBKey}
LENDER_B_ADDRESS=${lenderB.address}
`;

writeFileSync(envPath, existingEnv + appendix, "utf8");
console.log("\nAppended to .env.");
