import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// PRD v2, Appendix D: "docs and examples use Ethereum Sepolia = 1... confirm against the
// ChainInfo precompile before coding; do not assume it." This script calls
// get_supported_chains() on CC3 Testnet and reports which chainKey has chainId 11155111
// (Sepolia). Run before any script hardcodes a chain key. Writes the confirmed key to
// data/gate1/chain-key.json; DECISIONS.md D6 records the outcome once run.
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CC3_CHAIN_INFO_PRECOMPILE, CC3_RPC, SEPOLIA_CHAIN_ID } from "./lib/constants.mjs";
import { chainInfoAbi } from "./lib/chain-info-abi.mjs";

const rpcUrl = process.env.CC3_RPC_URL ?? CC3_RPC;
const publicClient = createPublicClient({ transport: http(rpcUrl) });

console.log(`Querying ChainInfo precompile at ${CC3_CHAIN_INFO_PRECOMPILE} via ${rpcUrl}...`);

const chains = await publicClient.readContract({
  address: CC3_CHAIN_INFO_PRECOMPILE,
  abi: chainInfoAbi,
  functionName: "get_supported_chains",
});

console.log(`\n${chains.length} supported chain(s):`);
for (const chain of chains) {
  const name = Buffer.from(chain.chainName.slice(2), "hex").toString("utf8");
  console.log(
    `  chainKey=${chain.chainKey} chainId=${chain.chainId} chainEncoding=${chain.chainEncoding} name=${JSON.stringify(name)}`
  );
}

const sepoliaEntry = chains.find((c) => c.chainId === BigInt(SEPOLIA_CHAIN_ID));

if (!sepoliaEntry) {
  console.error(`\nNo supported chain has chainId ${SEPOLIA_CHAIN_ID} (Sepolia). BLOCKED_BY_ATTESTCOIN.`);
  process.exit(1);
}

console.log(`\nConfirmed: Ethereum Sepolia (chainId ${SEPOLIA_CHAIN_ID}) is chainKey ${sepoliaEntry.chainKey}.`);

const outDir = fileURLToPath(new URL("../data/gate1", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("./chain-key.json", `file://${outDir}/`),
  JSON.stringify(
    {
      confirmedAt: new Date().toISOString(),
      rpcUrl,
      sepoliaChainId: SEPOLIA_CHAIN_ID,
      confirmedSepoliaChainKey: sepoliaEntry.chainKey.toString(),
      allSupportedChains: chains.map((c) => ({
        chainKey: c.chainKey.toString(),
        chainId: c.chainId.toString(),
        chainEncoding: c.chainEncoding,
      })),
    },
    null,
    2
  )
);
console.log("\nWritten to data/gate1/chain-key.json");
