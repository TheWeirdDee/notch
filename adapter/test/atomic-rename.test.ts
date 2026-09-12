import { expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicRename } from "../src/atomic-rename.js";

it("keeps the old journal visible while transient rename failures are retried", () => {
  const dir = mkdtempSync(join(tmpdir(), "notch-rename-"));
  const from = join(dir, "journal.tmp"), to = join(dir, "journal.json");
  writeFileSync(from, '["old","new"]'); writeFileSync(to, '["old"]');
  let calls = 0;
  atomicRename(from, to, (a, b) => {
    expect(readFileSync(to, "utf8")).toBe('["old"]');
    if (++calls < 3) throw Object.assign(new Error("injected scanner lock"), { code: "EPERM" });
    renameSync(a, b);
  });
  expect(calls).toBe(3);
  expect(JSON.parse(readFileSync(to, "utf8"))).toEqual(["old", "new"]);
});

it("does not swallow persistent permission errors", () => {
  const error = Object.assign(new Error("injected persistent lock"), { code: "EACCES" });
  const rename = vi.fn(() => { throw error; });
  expect(() => atomicRename("from", "to", rename)).toThrow(error);
  expect(rename).toHaveBeenCalledTimes(21);
});

it("does not retry non-transient filesystem errors", () => {
  const error = Object.assign(new Error("missing source"), { code: "ENOENT" });
  const rename = vi.fn(() => { throw error; });
  expect(() => atomicRename("from", "to", rename)).toThrow(error);
  expect(rename).toHaveBeenCalledTimes(1);
});
