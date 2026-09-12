// Gate 8: mints and approves enough ccUSD for the two demo lender wallets (reused from
// earlier gates -- LENDER_A, LENDER_B) to cover the demo draw plan (A: 70,000 succeeds,
// B: 40,000 refused for real). MockUSDC.mint is open on this testnet deployment.
import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const { abi: erc20Abi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/MockUSDC.sol", import.meta.url)));

const deployer = privateKeyToAccount(process.env.CC3_PRIVATE_KEY);
const deployerWallet = createWalletClient({ account: deployer, transport: http(RPC_URL) });

const CCUSD = process.env.MOCK_USDC_ADDRESS;
const VENUE = process.env.VENUE_ADDRESS;
const MINT_AMOUNT = 150000n * 10n ** 6n; // 150,000 ccUSD each, comfortable margin over the 70k/40k demo draws

for (const [name, envKey, pkEnvKey] of [["A", "LENDER_A_ADDRESS", "LENDER_A_PRIVATE_KEY"], ["B", "LENDER_B_ADDRESS", "LENDER_B_PRIVATE_KEY"]]) {
  const addr = process.env[envKey];
  const account = privateKeyToAccount(process.env[pkEnvKey]);
  const wallet = createWalletClient({ account, transport: http(RPC_URL) });

  const mintHash = await deployerWallet.writeContract({
    account: deployer, address: CCUSD, abi: erc20Abi, functionName: "mint", args: [addr, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`Lender ${name} (${addr}): minted ${MINT_AMOUNT} ccUSD, tx ${mintHash}`);

  const approveHash = await wallet.writeContract({
    account, address: CCUSD, abi: erc20Abi, functionName: "approve", args: [VENUE, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`Lender ${name}: approved venue for ${MINT_AMOUNT}, tx ${approveHash}`);

  const bal = await publicClient.readContract({ address: CCUSD, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
  const allow = await publicClient.readContract({ address: CCUSD, abi: erc20Abi, functionName: "allowance", args: [addr, VENUE] });
  console.log(`Lender ${name}: final balance=${bal} allowance=${allow}\n`);
}
