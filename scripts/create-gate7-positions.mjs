// Gate 7: create the frozen set's 5 real, rule-compliant Sepolia positions in one
// pass, before any results are looked at. Varied deposits, same micro scale as Gate 6
// (internal consistency -- see DECISIONS.md D25). cancelable=false, transferable=false,
// zero unlock amounts, a long cliff (3 hours) since the whole campaign's on-chain work
// has to fit inside it.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SABLIER_LOCKUP_SEPOLIA, SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";
import { createWithTimestampsLLAbi, createLockupLinearStreamEventAbi, erc20AbiMinimal } from "./lib/sablier-abi.mjs";

const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DEMO_ASSET = process.env.SEPOLIA_DEMO_ASSET;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sepolia balance: ${formatEther(balance)} ETH`);

// Varied deposits, same micro scale as Gate 6.
const DEPOSITS = [500n, 800n, 1200n, 600n, 1000n];

const now = Math.floor(Date.now() / 1000);
const startTime = now;
const cliffTime = now + 3 * 60 * 60; // 3 hours -- the whole campaign must fit inside this
const endTime = cliffTime + 24 * 60 * 60;

const outDir = fileURLToPath(new URL("../data/gate7/positions", import.meta.url));
mkdirSync(outDir, { recursive: true });

const positions = [];

for (let i = 0; i < DEPOSITS.length; i++) {
  const depositAmount = DEPOSITS[i] * 10n ** 18n;
  console.log(`\n=== Position ${i + 1}/5: deposit ${DEPOSITS[i]} ===`);

  const approveHash = await walletClient.writeContract({
    address: DEMO_ASSET,
    abi: erc20AbiMinimal,
    functionName: "approve",
    args: [SABLIER_LOCKUP_SEPOLIA, depositAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("  approve tx:", approveHash);

  const params = {
    sender: account.address,
    recipient: account.address,
    depositAmount,
    token: DEMO_ASSET,
    cancelable: false,
    transferable: false,
    timestamps: { start: startTime, end: endTime },
    shape: "",
  };
  const unlockAmounts = { start: 0n, cliff: 0n };
  const granularity = 0;

  await publicClient.simulateContract({
    account,
    address: SABLIER_LOCKUP_SEPOLIA,
    abi: createWithTimestampsLLAbi,
    functionName: "createWithTimestampsLL",
    args: [params, unlockAmounts, granularity, cliffTime],
  });

  const createHash = await walletClient.writeContract({
    address: SABLIER_LOCKUP_SEPOLIA,
    abi: createWithTimestampsLLAbi,
    functionName: "createWithTimestampsLL",
    args: [params, unlockAmounts, granularity, cliffTime],
  });
  console.log("  create tx:", createHash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
  console.log("  status:", receipt.status, "block:", receipt.blockNumber);

  let streamId;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: createLockupLinearStreamEventAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "CreateLockupLinearStream") {
        streamId = decoded.args.streamId;
        break;
      }
    } catch {
      // skip
    }
  }
  console.log("  stream id:", streamId?.toString());

  const evidence = {
    positionIndex: i + 1,
    network: "ethereum-sepolia",
    sourceChainKey: SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT,
    sourceContract: SABLIER_LOCKUP_SEPOLIA,
    createTxHash: createHash,
    blockNumber: receipt.blockNumber.toString(),
    streamId: streamId?.toString(),
    borrower: account.address,
    demoAsset: DEMO_ASSET,
    depositAmount: depositAmount.toString(),
    depositAmountHuman: DEPOSITS[i].toString(),
    cancelable: false,
    transferable: false,
    unlockAmountsStart: "0",
    unlockAmountsCliff: "0",
    timestampsStart: startTime,
    timestampsEnd: endTime,
    cliffTime,
    recordedAt: new Date().toISOString(),
  };
  writeFileSync(new URL(`./position-${i + 1}.json`, `file://${outDir}/`), JSON.stringify(evidence, null, 2));
  positions.push(evidence);
}

writeFileSync(fileURLToPath(new URL("../data/gate7/positions/all-positions.json", import.meta.url)), JSON.stringify(positions, null, 2));
console.log("\nAll 5 positions created. Written to data/gate7/positions/.");
