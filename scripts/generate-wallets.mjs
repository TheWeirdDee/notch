import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Generates two fresh burner keypairs for Gate 1: one to create the Sablier stream on
// Sepolia, one to submit the proof to the BlockProver precompile on Creditcoin CC3
// Testnet. Writes them to .env (gitignored). Run once; re-running overwrites .env.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync as nativeWriteFileSync, existsSync, readFileSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, "utf8");
  if (existing.includes("SEPOLIA_PRIVATE_KEY=") && existing.includes("CC3_PRIVATE_KEY=")) {
    console.log(".env already has both keys; not overwriting. Delete it first to regenerate.");
    process.exit(0);
  }
}

const sepoliaKey = generatePrivateKey();
const sepoliaAccount = privateKeyToAccount(sepoliaKey);

const cc3Key = generatePrivateKey();
const cc3Account = privateKeyToAccount(cc3Key);

const env = `# Gate 1 burner wallets — testnet only, gitignored. Do not reuse for anything of value.
SEPOLIA_PRIVATE_KEY=${sepoliaKey}
SEPOLIA_ADDRESS=${sepoliaAccount.address}

CC3_PRIVATE_KEY=${cc3Key}
CC3_ADDRESS=${cc3Account.address}

SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CC3_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
`;

writeFileSync(envPath, env, "utf8");

console.log("Generated burner wallets:");
console.log("Sepolia address:", sepoliaAccount.address);
console.log("CC3 Testnet address:", cc3Account.address);
console.log("\nWritten to .env (gitignored). Fund these two addresses from faucets, then continue.");
