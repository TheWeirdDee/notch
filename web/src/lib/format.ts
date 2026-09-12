import { DEPOSIT_ASSET_DECIMALS, CCUSD_DECIMALS } from "./constants";

/** Formats a raw bigint (18-decimal deposit-asset units) as a human integer string with
 * thousands separators, e.g. 70000000000000000000000n -> "70,000". Demo amounts are
 * always whole numbers by construction (D14) -- this never rounds a real fraction away. */
export function formatDeposit(raw: bigint): string {
  const whole = raw / 10n ** BigInt(DEPOSIT_ASSET_DECIMALS);
  const remainder = raw % 10n ** BigInt(DEPOSIT_ASSET_DECIMALS);
  const wholeStr = whole.toLocaleString("en-US");
  if (remainder === 0n) return wholeStr;
  const fraction = remainder.toString().padStart(DEPOSIT_ASSET_DECIMALS, "0").replace(/0+$/, "");
  return `${wholeStr}.${fraction}`;
}

/** Formats a raw bigint (6-decimal ccUSD units) the same way. */
export function formatCcUsd(raw: bigint): string {
  const whole = raw / 10n ** BigInt(CCUSD_DECIMALS);
  const remainder = raw % 10n ** BigInt(CCUSD_DECIMALS);
  const wholeStr = whole.toLocaleString("en-US");
  if (remainder === 0n) return wholeStr;
  const fraction = remainder.toString().padStart(CCUSD_DECIMALS, "0").replace(/0+$/, "");
  return `${wholeStr}.${fraction}`;
}

/** Parses a human-typed whole-number string into raw deposit-asset units. Only used for
 * the "Amount to finance" field -- this is a lender choosing how much of the ALREADY
 * decoded capacity to draw, never a way to assert what the capacity itself is (that
 * would be the user_supplied_amount ablation, F11: never wired to production). */
export function parseDepositAmount(human: string): bigint | null {
  const trimmed = human.trim().replace(/,/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed) * 10n ** BigInt(DEPOSIT_ASSET_DECIMALS);
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** viem errors carry a short, human `shortMessage` alongside a long `message` that
 * dumps the full calldata and args -- prefer the short one so a wallet/chain error
 * reads as a sentence, not a wall of hex (F5/F8: refusals and failures are first-class,
 * calm states, never a raw dump). */
export function shortErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err && typeof err.shortMessage === "string") {
    return err.shortMessage;
  }
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}
