import { describe, expect, it } from "vitest";
import { NOTCH_CORE_VERSION } from "./index.js";

describe("package smoke test", () => {
  it("core package loads and exposes a version marker", () => {
    expect(NOTCH_CORE_VERSION).toBe("0.3.0-gate4");
  });
});
