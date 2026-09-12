// One-off diagnostic: for every REFUSED finance attempt in the Gate 7 campaign run,
// re-simulate the EXACT same call (same actionKey, lender, claimId, amount) at the
// historical block right after the previous real state change for that claim, to
// recover the TRUE on-chain revert reason. The campaign script's catch-all labeled
// every failure "INSUFFICIENT_CAPACITY" without checking -- this finds out which ones
// actually were, and which were something else (e.g. an actionKey collision with
// Gate 6's own prior use of the same small sequential actionKey values).
import "dotenv/config";
import { createPublicClient, http, pad, toHex } from "viem";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const client = createPublicClient({ transport: http(process.env.CC3_RPC_URL) });
const { abi: venueAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));

const LENDERS = { A: process.env.LENDER_A_ADDRESS, B: process.env.LENDER_B_ADDRESS, C: process.env.LENDER_C_ADDRESS };

// From the campaign's own console output (this run).
const positions = [
  { idx: 1, claimId: "0x5987d6e108a3a5dd6afc644f0a6e524743b7a1ca753650241c412d9a8ab7df2c", instTx: "0xd6ee1fb78cc879e2de08aaa0473b95f21d862007f834920de77fd2cb8a9e220c",
    steps: [
      { step: 1, lender: "A", amount: 350n, actionKey: 1, outcome: "REFUSED" },
      { step: 2, lender: "B", amount: 300n, actionKey: 2, outcome: "SUCCEEDED", tx: "0x49f695071aa39552493c640d8fa26ce75ec927fcf94478b541d95439cb05d7d4" },
      { step: 3, lender: "C", amount: 250n, actionKey: 3, outcome: "REFUSED" },
      { step: 4, lender: "A", amount: 350n, actionKey: 4, outcome: "REFUSED" },
    ] },
  { idx: 2, claimId: "0x9993400f60b5e6d776dc46ce9962cbf933f1905ba08395c6415a7c062c14d0e8", instTx: "0x5b5f2280b3c23b0d88594887a630f8031c640a9550ceec79d4f6f5c7a4f66b8f",
    steps: [
      { step: 1, lender: "A", amount: 560n, actionKey: 5, outcome: "SUCCEEDED", tx: "0x83121f6049e95e6be4ba258f74286383c684e8b4a376de8d19d00bc9b7075dfc" },
      { step: 2, lender: "B", amount: 480n, actionKey: 6, outcome: "REFUSED" },
      { step: 3, lender: "C", amount: 400n, actionKey: 7, outcome: "REFUSED" },
      { step: 4, lender: "A", amount: 560n, actionKey: 8, outcome: "REFUSED" },
    ] },
  { idx: 3, claimId: "0xdf489ff6ad236c24c498699c5d990376f4556e5c495abfc1172eadc73aba8c5c", instTx: "0x23ad740329d873a3b909c0e0c8421049eb94db8bfa28a20a2ce5a34300785940",
    steps: [
      { step: 1, lender: "A", amount: 840n, actionKey: 9, outcome: "REFUSED" },
      { step: 2, lender: "B", amount: 720n, actionKey: 10, outcome: "SUCCEEDED", tx: "0x38153a48088a77f5d30ec3a34ede9e59b1d84486ff2c153df777dd84d01a07b7" },
      { step: 3, lender: "C", amount: 600n, actionKey: 11, outcome: "REFUSED" },
      { step: 4, lender: "A", amount: 840n, actionKey: 12, outcome: "REFUSED" },
    ] },
  { idx: 4, claimId: "0x9e9ff742573b8597bf949f62bb267019ea2ec111bc4935bd2cbbe9c03b16d59a", instTx: "0xabbc4e73a532580701112ee6278ee05364ef1835a95da641768194a7bb2056df",
    steps: [
      { step: 1, lender: "A", amount: 420n, actionKey: 13, outcome: "SUCCEEDED", tx: "0xff0473aebc0528f54c7aff54c17421de06554a84a9d7f8a25ad0fb3bfce93367" },
      { step: 2, lender: "B", amount: 360n, actionKey: 14, outcome: "REFUSED" },
      { step: 3, lender: "C", amount: 300n, actionKey: 15, outcome: "REFUSED" },
      { step: 4, lender: "A", amount: 420n, actionKey: 16, outcome: "REFUSED" },
    ] },
  { idx: 5, claimId: "0xc2c30f2f66398f71b4b1791947f979f5fd685db19841108f697f9455f9483501", instTx: "0x50f5bc1effc29bd023458f26efd565fade629a7567a181c81d54f5477498e507",
    steps: [
      { step: 1, lender: "A", amount: 700n, actionKey: 17, outcome: "REFUSED" },
      { step: 2, lender: "B", amount: 600n, actionKey: 18, outcome: "SUCCEEDED", tx: "0x4acaaec0932d12fbc421a87d8f1243b3182f37d87e041a0725233e64d49e775e" },
      { step: 3, lender: "C", amount: 500n, actionKey: 19, outcome: "REFUSED" },
      { step: 4, lender: "A", amount: 700n, actionKey: 20, outcome: "REFUSED" },
    ] },
];

async function blockAfter(txHash) {
  const r = await client.getTransactionReceipt({ hash: txHash });
  return r.blockNumber;
}

for (const pos of positions) {
  console.log(`\n=== position-${pos.idx} ===`);
  let stateBlock = await blockAfter(pos.instTx); // state right after instantiate, before any finance
  for (const s of pos.steps) {
    if (s.outcome === "SUCCEEDED") {
      stateBlock = await blockAfter(s.tx); // advance state timeline past this real success
      console.log(`  step ${s.step} (${s.lender}, ${s.amount}, actionKey=${s.actionKey}): SUCCEEDED for real (tx ${s.tx}) -- no diagnosis needed`);
      continue;
    }
    const actionKey = pad(toHex(s.actionKey), { size: 32 });
    const amount = s.amount * 10n ** 18n;
    try {
      await client.simulateContract({
        account: LENDERS[s.lender], address: process.env.VENUE_ADDRESS, abi: venueAbi,
        functionName: "finance", args: [actionKey, pos.claimId, amount], blockNumber: stateBlock,
      });
      console.log(`  step ${s.step} (${s.lender}, ${s.amount}, actionKey=${s.actionKey}): SIMULATED OK AT BLOCK ${stateBlock} -- unexpected, was recorded REFUSED live`);
    } catch (err) {
      const errorName = err.cause?.data?.errorName ?? err.shortMessage ?? err.message;
      console.log(`  step ${s.step} (${s.lender}, ${s.amount}, actionKey=${s.actionKey}) @block ${stateBlock}: TRUE REASON = ${errorName}`);
    }
  }
}
