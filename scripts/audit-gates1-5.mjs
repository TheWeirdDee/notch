// RETIRED: historical pre-fix reproducer. Current contract behavior is tested by npm test.
throw new Error("Historical pre-fix audit harness retired. Run npm test for current contract regression tests.");
import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Read-only audit: eth_call executes a synthetic Solidity harness; it never sends
// a transaction. Created contracts/state exist only inside the discarded call.
import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync as nativeWriteFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, decodeAbiParameters, parseAbi } from "viem";
import solc from "solc";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidenceDir = `${root}/data/audit-gates1-5`;
mkdirSync(evidenceDir, { recursive: true });
const client = createPublicClient({ transport: http(process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network", { timeout: 30000, retryCount: 0 }) });
const harness = `
pragma solidity ^0.8.28;
import "AttestedCashflowRegistry.sol";
import "CashflowLendingVenue.sol";
import "MockUSDC.sol";
// SYNTHETIC initial state, not an Attestcoin proof or real claim.
contract SeededRegistry is AttestedCashflowRegistry {
  constructor() AttestedCashflowRegistry(address(0), address(1)) {
    claims[bytes32(0)] = Claim(bytes32(0), 1, bytes32(0), address(1), 1,
      address(0xB0B), address(1), 1e18, 0, uint40(block.timestamp + 10000), true);
  }
}
contract AuditHarness {
  constructor() {
    MockUSDC token = new MockUSDC();
    SeededRegistry registry = new SeededRegistry();
    CashflowLendingVenue venue = new CashflowLendingVenue(address(registry), address(token), 18);
    registry.setVenue(address(venue));
    // No funds and no allowance: positive capacity consumption still succeeds.
    venue.finance(bytes32(0), 1);
    uint256 afterDust = 1e18 - registry.available(bytes32(0));
    uint256 paidDust = token.balanceOf(address(0xB0B));
    // Transfer failure really must unwind earlier capacity mutation.
    uint256 beforeFailed = registry.available(bytes32(0));
    (bool transferSucceeded,) = address(venue).call(abi.encodeCall(venue.finance, (bytes32(0), uint128(1e12))));
    bool rolledBack = !transferSucceeded && registry.available(bytes32(0)) == beforeFailed;
    // Owner can authorize itself and consume without origination/transfer.
    registry.setVenue(address(this));
    registry.consume(bytes32(0), 1000);
    uint256 afterAdmin = 1e18 - registry.available(bytes32(0));
    bytes memory result = abi.encode(afterDust, paidDust, rolledBack, afterAdmin, token.balanceOf(address(0xB0B)));
    assembly { return(add(result, 32), mload(result)) }
  }
}`;
const sources = Object.fromEntries(["AttestedCashflowRegistry.sol", "CashflowLendingVenue.sol", "MockUSDC.sol"].map(name => [name, { content: readFileSync(`${root}/contracts/src/${name}`, "utf8") }]));
sources["AuditHarness.sol"] = { content: harness };
const output = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources,
  settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } })));
const errors = (output.errors ?? []).filter(e => e.severity === "error");
if (errors.length) throw Error(errors.map(e => e.formattedMessage).join("\n"));
const evidence = { recordedAt: new Date().toISOString(), scope: "Read-only eth_call; synthetic seeded registry; no transaction broadcast", compiler: solc.version(), findings: {}, historicalTransactions: [] };
try {
  const deployment = JSON.parse(readFileSync(`${root}/data/gate3/deployment.json`, "utf8"));
  const registry = deployment.contracts.AttestedCashflowRegistry.address;
  const venue = await client.readContract({ address: registry, abi: parseAbi(["function venue() view returns (address)"]), functionName: "venue" });
  const [depositDecimals, settlementDecimals] = await Promise.all([
    client.readContract({ address: venue, abi: parseAbi(["function depositAssetDecimals() view returns (uint8)"]), functionName: "depositAssetDecimals" }),
    client.readContract({ address: venue, abi: parseAbi(["function ccUSDDecimals() view returns (uint8)"]), functionName: "ccUSDDecimals" }),
  ]);
  evidence.currentTopology = { registry, venue, depositDecimals, settlementDecimals, manifestVenue: deployment.contracts.CashflowLendingVenue.address,
    manifestMatches: venue.toLowerCase() === deployment.contracts.CashflowLendingVenue.address.toLowerCase() };
} catch (error) { evidence.topologyFailure = error.name; }
try {
  const result = await client.call({ data: `0x${output.contracts["AuditHarness.sol"].AuditHarness.evm.bytecode.object}`, gas: 15000000n });
  const [capacityConsumed, ccUSDPaid, transferFailureRolledBack, adminCapacityConsumed, adminCCUSDPaid] = decodeAbiParameters([
    { type: "uint256" }, { type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" },
  ], result.data);
  evidence.findings = { capacityConsumed, ccUSDPaid, transferFailureRolledBack, adminCapacityConsumed, adminCCUSDPaid };
} catch (error) { evidence.harnessFailure = error.name; }
const txs = [
  "0x5c0ee8c904f66ace23bb56740048301ad375aad3ab682d6f9519e78d11029e89",
  "0x96e4427956d3fae645990f223563bb427f60eb9c7bd7e7271cb6dbd005108bf3",
  "0xf8c19f56180f378eb5ef8e006c2e8fcc084828c231f5333100897a291a757e1d",
  "0xee4ad848bff6ddd94058daf65c08d1d443f0cb23af046e68bfadcef87dff311c",
];
evidence.historicalTransactions = await Promise.all(txs.map(async hash => {
  try { const r = await client.getTransactionReceipt({ hash }); return { hash, status: r.status, blockNumber: r.blockNumber, logs: r.logs }; }
  catch (error) { return { hash, error: error.name }; }
}));
writeFileSync(`${evidenceDir}/contract-readonly.json`, JSON.stringify(evidence, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
console.log(JSON.stringify({ findings: evidence.findings, currentTopology: evidence.currentTopology, harnessFailure: evidence.harnessFailure, historicalTransactions: evidence.historicalTransactions.map(({ hash, status, error }) => ({ hash, status, error })) }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
