import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { instantiate } from "./instantiate.js";
import { apply } from "./apply.js";
import type { Claim, Loan, Proof } from "./types.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

interface FixtureFile {
  operation: "instantiate" | "instantiate_twice" | "apply" | "apply_sequence";
  proof?: Proof;
  first?: Proof;
  second?: Proof;
  claim?: Claim;
  loan?: Loan;
  loans?: Loan[];
}

function loadFixture(name: string): FixtureFile {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));
}

function loadGolden(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/golden/${name}.json`, import.meta.url), "utf8"));
}

function run(fixture: FixtureFile): unknown {
  switch (fixture.operation) {
    case "instantiate":
      return instantiate(fixture.proof!, null);
    case "instantiate_twice": {
      const first = instantiate(fixture.first!, null);
      const second = instantiate(fixture.second!, first.ok ? first.claim : null);
      return { first, second };
    }
    case "apply":
      return apply(fixture.loan!, fixture.claim!);
    case "apply_sequence": {
      let currentClaim = fixture.claim!;
      const results = [];
      for (const loan of fixture.loans!) {
        const result = apply(loan, currentClaim);
        results.push(result);
        if (result.ok) currentClaim = result.claim;
      }
      return { results };
    }
    default:
      throw new Error(`unknown operation ${(fixture as { operation: string }).operation}`);
  }
}

function expectMatchesGolden(caseName: string) {
  const fixture = loadFixture(caseName);
  const golden = loadGolden(caseName);
  expect(run(fixture)).toEqual(golden);
}

describe("reference model: fixture pack (16 cases, Gate 2)", () => {
  // instantiate() -- shape and proof-gate rejections
  it("wrong-chain-key: proof verifies but chainKey != Sepolia's confirmed key -> rejected", () => {
    expectMatchesGolden("wrong-chain-key");
  });
  it("failed-receipt: receiptStatus 0 -> rejected, no claim created", () => {
    expectMatchesGolden("failed-receipt");
  });
  it("cancelable-stream: cancelable=true -> rejected", () => {
    expectMatchesGolden("cancelable-stream");
  });
  it("non-zero-unlock: unlockAmounts.start != 0 -> rejected", () => {
    expectMatchesGolden("non-zero-unlock");
  });
  it("past-cliff: now_at_instantiation >= cliffTime -> rejected", () => {
    expectMatchesGolden("past-cliff");
  });
  it("wrong-source-contract: sourceContract not the allowlisted SablierLockup -> rejected", () => {
    expectMatchesGolden("wrong-source-contract");
  });
  it("broker-fee-total-amount: originalCapacity = event depositAmount, never totalAmount", () => {
    expectMatchesGolden("broker-fee-total-amount");
    const fixture = loadFixture("broker-fee-total-amount");
    const result = instantiate(fixture.proof!, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claim.originalCapacity).toBe(fixture.proof!.depositAmount);
      expect(result.claim.originalCapacity).not.toBe(fixture.proof!.totalAmount);
    }
  });
  it("fake-merkle-proof: precompile.verify(...) returns false -> rejected, no claim", () => {
    expectMatchesGolden("fake-merkle-proof");
  });
  it("missing-precompile: precompile unreachable -> rejected, distinct from a false verify result", () => {
    expectMatchesGolden("missing-precompile");
  });
  it("replay: re-instantiating the same source tx is rejected; the first instantiate is not", () => {
    expectMatchesGolden("replay");
  });

  // apply() -- conservation and authorization
  it("zero-amount: amount=0 -> rejected", () => {
    expectMatchesGolden("zero-amount");
  });
  it("exact-remainder: financing exactly the remainder succeeds, drives available to zero", () => {
    expectMatchesGolden("exact-remainder");
  });
  it("remainder-plus-one: financing remainder+1 -> rejected, over-draw refused", () => {
    expectMatchesGolden("remainder-plus-one");
  });
  it("two-lender-race: first applied wins, second lender's over-draw on the residual is rejected", () => {
    expectMatchesGolden("two-lender-race");
  });
  it("inactive-claim: financing a claim with active=false -> rejected", () => {
    expectMatchesGolden("inactive-claim");
  });
  it("unauthorized-venue: a call not routed through the authorized venue -> rejected", () => {
    expectMatchesGolden("unauthorized-venue");
  });

  it("fixture pack is exactly the 16 required cases, no more, no less", () => {
    const required = [
      "zero-amount",
      "exact-remainder",
      "remainder-plus-one",
      "two-lender-race",
      "replay",
      "wrong-chain-key",
      "failed-receipt",
      "cancelable-stream",
      "non-zero-unlock",
      "past-cliff",
      "wrong-source-contract",
      "broker-fee-total-amount",
      "inactive-claim",
      "unauthorized-venue",
      "fake-merkle-proof",
      "missing-precompile",
    ];
    const present = readdirSync(fixturesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(present).toEqual([...required].sort());
  });
});

describe("pass bar (Gate 2 instructions, stated explicitly)", () => {
  it("over-draw is rejected (remainder+1 case)", () => {
    const fixture = loadFixture("remainder-plus-one");
    const result = apply(fixture.loan!, fixture.claim!);
    expect(result.ok).toBe(false);
  });

  it("re-instantiation of the same source is rejected", () => {
    const fixture = loadFixture("replay");
    const first = instantiate(fixture.first!, null);
    expect(first.ok).toBe(true);
    const second = instantiate(fixture.second!, first.ok ? first.claim : null);
    expect(second).toEqual({ ok: false, reason: "CLAIM_ALREADY_ACTIVE" });
  });

  it("a failed receipt creates no claim", () => {
    const fixture = loadFixture("failed-receipt");
    const result = instantiate(fixture.proof!, null);
    expect(result.ok).toBe(false);
    expect("claim" in result).toBe(false);
  });

  it("the broker-fee fixture proves capacity = event deposit, not totalAmount", () => {
    const fixture = loadFixture("broker-fee-total-amount");
    const result = instantiate(fixture.proof!, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(BigInt(result.claim.originalCapacity)).toBe(BigInt(fixture.proof!.depositAmount));
      expect(BigInt(result.claim.originalCapacity)).not.toBe(BigInt(fixture.proof!.totalAmount!));
    }
  });
});

describe("determinism", () => {
  it("instantiate is pure: same input, called twice, produces identical output", () => {
    const fixture = loadFixture("broker-fee-total-amount");
    const a = instantiate(fixture.proof!, null);
    const b = instantiate(fixture.proof!, null);
    expect(a).toEqual(b);
  });

  it("apply is pure: same input, called twice, produces identical output", () => {
    const fixture = loadFixture("exact-remainder");
    const a = apply(fixture.loan!, fixture.claim!);
    const b = apply(fixture.loan!, fixture.claim!);
    expect(a).toEqual(b);
  });
});
