import type { Proof, Claim, Loan } from "./types.js";
export function uint(value: unknown, bits: number, name: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`Invalid ${name}`);
  const n = BigInt(value);
  if (n >= 2n ** BigInt(bits)) throw new Error(`${name} exceeds uint${bits}`);
  return n;
}
function integer(value: unknown, bits: number, name: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= 2 ** bits) throw new Error(`Invalid ${name}`);
}
function hex(value: unknown, bytes: number, name: string): void {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)) throw new Error(`Invalid ${name}`);
}
function bool(value: unknown): void { if (typeof value !== "boolean") throw new Error("Invalid boolean"); }
export function validateProof(p: Proof): void {
  bool(p.precompileAvailable); bool(p.proofVerified); bool(p.cancelable);
  if (p.receiptStatus !== 0 && p.receiptStatus !== 1) throw new Error("Invalid receiptStatus");
  integer(p.chainKey, 32, "chainKey"); hex(p.sourceTxHash, 32, "sourceTxHash"); uint(p.streamId, 256, "streamId");
  for (const name of ["sourceContract", "recipient", "token"] as const) hex(p[name], 20, name);
  for (const name of ["depositAmount", "unlockAmountsStart", "unlockAmountsCliff"] as const) uint(p[name], 128, name);
  for (const name of ["cliffTime", "endTime", "now_at_instantiation", "received_at"] as const) integer(p[name], 40, name);
  if (p.rulesVersion !== undefined) {
    if (p.rulesVersion !== 2) throw new Error("Unsupported proof version");
    hex(p.attestedTxDigest, 32, "attestedTxDigest"); bool(p.transferable);
  } else if (p.attestedTxDigest !== undefined) throw new Error("Authenticated digest requires version 2");
}
export function validateClaim(c: Claim): void {
  const capacity = uint(c.originalCapacity, 128, "originalCapacity");
  if (uint(c.financedCapacity, 128, "financedCapacity") > capacity) throw new Error("Conservation violation");
  bool(c.active); integer(c.sourceChainKey, 32, "sourceChainKey"); integer(c.lockedUntil, 40, "lockedUntil");
  uint(c.streamId, 256, "streamId"); hex(c.claimId, 32, "claimId"); hex(c.sourceTxHash, 32, "sourceTxHash");
  for (const name of ["sourceContract", "borrower", "asset"] as const) hex(c[name], 20, name);
  if (c.rulesVersion !== undefined) {
    if (c.rulesVersion !== 2) throw new Error("Unsupported claim version");
    hex(c.attestedTxDigest, 32, "attestedTxDigest");
  }
}
export function validateLoan(l: Loan, c: Claim): void {
  uint(l.amount, 128, "amount"); bool(l.viaAuthorizedVenue); bool(l.transferWouldSucceed);
  if (c.rulesVersion === 2) { hex(l.lender, 20, "lender"); integer(l.nowAt, 40, "nowAt"); }
}
