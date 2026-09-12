import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, stringToBytes } from "viem";
import { paths } from "./ledger.js";
/** Content-addressed immutable payloads. Hash exactly matches the submitted response. */
export function storeProofPayload(response: unknown, directory = join(paths.DATA_DIR, "proofs")): string {
  const raw = JSON.stringify(response);
  const hash = keccak256(stringToBytes(raw));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${hash}.json`);
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== raw) throw new Error("Proof payload store corruption");
  } else {
    try { writeFileSync(path, raw, { encoding: "utf8", flag: "wx", flush: true }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST" || readFileSync(path, "utf8") !== raw) throw e; }
  }
  return hash;
}
export function readProofPayload(hash: string, directory = join(paths.DATA_DIR, "proofs")): unknown {
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error("Invalid proof hash");
  const raw = readFileSync(join(directory, `${hash}.json`), "utf8");
  if (keccak256(stringToBytes(raw)) !== hash) throw new Error("Proof payload integrity failure");
  return JSON.parse(raw);
}
