// Funds the user's own two wallet addresses (their real MetaMask accounts, not the
// pre-set demo lender keys) for live Gate 8 UI testing: native CC3 gas (to pay for
// instantiateClaim/approve/finance) and ccUSD balance (MockUSDC.mint is open on this
// testnet deployment). Approval to the venue is deliberately NOT pre-set here -- the
// app itself prompts a real approve() signature the first time it's needed, exactly as
// it would for any judge connecting a fresh wallet.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseEther, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const { abi: erc20Abi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/MockUSDC.sol", import.meta.url)));

const deployer = privateKeyToAccount(process.env.CC3_PRIVATE_KEY);
const deployerWallet = createWalletClient({ account: deployer, transport: http(RPC_URL) });
const CCUSD = process.env.MOCK_USDC_ADDRESS;

const targets = process.argv.slice(2);
if (targets.length === 0) throw new Error("Usage: node scripts/fund-user-wallets.mjs <address> [<address> ...]");
for (const a of targets) if (!isAddress(a)) throw new Error(`Not a valid address: ${a}`);

const GAS_AMOUNT = parseEther("2"); // 2 tCTC, comfortable for several transactions
const CCUSD_AMOUNT = 150000n * 10n ** 6n; // 150,000 ccUSD

for (const addr of targets) {
  console.log(`\n=== ${addr} ===`);

  const gasHash = await deployerWallet.sendTransaction({ account: deployer, to: addr, value: GAS_AMOUNT });
  await publicClient.waitForTransactionReceipt({ hash: gasHash });
  console.log(`  sent ${GAS_AMOUNT} wei native gas, tx ${gasHash}`);

  const mintHash = await deployerWallet.writeContract({
    account: deployer, address: CCUSD, abi: erc20Abi, functionName: "mint", args: [addr, CCUSD_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`  minted ${CCUSD_AMOUNT} ccUSD, tx ${mintHash}`);

  const nativeBal = await publicClient.getBalance({ address: addr });
  const ccUsdBal = await publicClient.readContract({ address: CCUSD, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
  console.log(`  final: native=${nativeBal} ccUSD=${ccUsdBal}`);
}
