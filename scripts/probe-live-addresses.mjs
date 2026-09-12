import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Cheap, fund-free sanity check (PRD v2 Gate 1: "read the live Sepolia ABI... do not code
// the production decoder against a blog ABI"). Confirms every pinned address actually has
// deployed bytecode before any script relies on an assumed interface for it. Does not
// confirm the ABI is correct -- only that something is deployed there. Real ABI
// confirmation happens by exercising verifyAndDecode against a real proof in Gate 1.
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SABLIER_LOCKUP_SEPOLIA,
  CC3_BLOCK_PROVER_PRECOMPILE,
  CC3_CHAIN_INFO_PRECOMPILE,
  CC3_DECODER_CONTRACT,
  CC3_RPC,
} from "./lib/constants.mjs";

const sepoliaRpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const cc3Rpc = process.env.CC3_RPC_URL ?? CC3_RPC;

const sepoliaClient = createPublicClient({ chain: sepolia, transport: http(sepoliaRpc) });
const cc3Client = createPublicClient({ transport: http(cc3Rpc) });

const targets = [
  { label: "SablierLockup v4.0 (Sepolia)", client: sepoliaClient, address: SABLIER_LOCKUP_SEPOLIA, isPrecompile: false },
  { label: "BlockProver precompile (CC3)", client: cc3Client, address: CC3_BLOCK_PROVER_PRECOMPILE, isPrecompile: true },
  { label: "ChainInfo precompile (CC3)", client: cc3Client, address: CC3_CHAIN_INFO_PRECOMPILE, isPrecompile: true },
  { label: "Decoder contract (CC3)", client: cc3Client, address: CC3_DECODER_CONTRACT, isPrecompile: false },
];

// Native precompiles (Rust runtime code, not Solidity bytecode) legitimately return
// empty `eth_getCode` even when fully functional -- confirmed independently by
// confirm-chain-key.mjs successfully calling the ChainInfo precompile despite it
// showing "no code" here. So for precompiles this check is informational only, never
// a failure condition; only ordinary contracts are expected to carry bytecode.
const results = [];
for (const t of targets) {
  const code = await t.client.getBytecode({ address: t.address });
  const hasCode = Boolean(code) && code !== "0x";
  const ok = hasCode || t.isPrecompile;
  const note = t.isPrecompile && !hasCode ? "expected empty (native precompile)" : hasCode ? `${(code.length - 2) / 2} bytes` : "no code";
  console.log(`${ok ? "OK  " : "MISS"}  ${t.label.padEnd(32)} ${t.address}  (${note})`);
  results.push({ label: t.label, address: t.address, hasCode, isPrecompile: t.isPrecompile, ok, byteLength: hasCode ? (code.length - 2) / 2 : 0 });
}

const outDir = fileURLToPath(new URL("../data/gate1", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("./address-probe.json", `file://${outDir}/`),
  JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2)
);
console.log("\nWritten to data/gate1/address-probe.json");

if (results.some((r) => !r.ok)) {
  console.error("\nAt least one non-precompile pinned address has no deployed code. BLOCKED_BY_ATTESTCOIN.");
  process.exit(1);
}
