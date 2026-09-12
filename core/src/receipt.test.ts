import { describe, expect, it } from "vitest";
import { computeReceiptHash, type ReceiptHashInput, type Receipt } from "./receipt.js";
import { instantiate, apply } from "./index.js";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/broker-fee-total-amount.json", import.meta.url), "utf8"));
const instantiateResult = instantiate(fixture.proof, null);
if (!instantiateResult.ok) throw new Error("fixture expected to succeed");
const claim = instantiateResult.claim;

function baseInput(): ReceiptHashInput {
  return {
    mode: "PAPER",
    action: "finance",
    claim_id: claim.claimId,
    proof_inputs: {
      chainKey: 1,
      headerNumber: "123",
      txHash: "0xabc",
      rawProofPayloadHash: "0xdef",
      decodedProof: fixture.proof,
    },
    claim_before: claim,
    claim_after: apply({ lender: "0xL", amount: "1000", viaAuthorizedVenue: true, transferWouldSucceed: true }, claim).ok
      ? (apply({ lender: "0xL", amount: "1000", viaAuthorizedVenue: true, transferWouldSucceed: true }, claim) as { ok: true; claim: Receipt["claim_after"] }).claim
      : null,
    capacity_before: "100000000000000000000000",
    capacity_after: "99999999999999999999000",
    lender: "0xL",
    amount: "1000",
    refused: false,
    reason_code: null,
  };
}

describe("computeReceiptHash", () => {
  it("is deterministic: same input, same hash", () => {
    const a = computeReceiptHash(baseInput());
    const b = computeReceiptHash(baseInput());
    expect(a).toBe(b);
  });

  it("is insensitive to key order (canonicalized)", () => {
    const input = baseInput();
    const reordered: ReceiptHashInput = {
      reason_code: input.reason_code,
      refused: input.refused,
      amount: input.amount,
      lender: input.lender,
      capacity_after: input.capacity_after,
      capacity_before: input.capacity_before,
      claim_after: input.claim_after,
      claim_before: input.claim_before,
      proof_inputs: input.proof_inputs,
      claim_id: input.claim_id,
      action: input.action,
      mode: input.mode,
    };
    expect(computeReceiptHash(reordered)).toBe(computeReceiptHash(input));
  });

  it("changes if capacity math changes", () => {
    const a = computeReceiptHash(baseInput());
    const changed = { ...baseInput(), amount: "2000" };
    expect(computeReceiptHash(changed)).not.toBe(a);
  });

  it("does not take prose fields as input at all -- the type excludes them", () => {
    // receipt_id, verify_command, limitations, recorded_at, fill are not part of
    // ReceiptHashInput -- this is a type-level guarantee, asserted here for visibility.
    const input = baseInput();
    expect(Object.keys(input)).not.toContain("limitations");
    expect(Object.keys(input)).not.toContain("verify_command");
    expect(Object.keys(input)).not.toContain("recorded_at");
    expect(Object.keys(input)).not.toContain("receipt_id");
    expect(Object.keys(input)).not.toContain("fill");
  });
});
