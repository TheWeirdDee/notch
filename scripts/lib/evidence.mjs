import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Append immutable snapshots before updating a latest-view file. Preserve both the
// existing historical record and the new result, including failed/abandoned runs.
export function writeEvidenceFile(target, data, options) {
  const path = target instanceof URL ? fileURLToPath(target) : target;
  if (typeof path !== "string" || !path.endsWith(".json")) return writeFileSync(target, data, options);
  const history = join(dirname(path), "history", basename(path, ".json"));
  mkdirSync(history, { recursive: true });
  const id = `${Date.now()}-${randomUUID()}`;
  if (existsSync(path)) writeFileSync(join(history, `${id}-previous.json`), readFileSync(path), { flag: "wx", flush: true });
  writeFileSync(join(history, `${id}.json`), data, { ...(typeof options === "object" ? options : {}), flag: "wx", flush: true });
  const temp = `${path}.${id}.tmp`;
  writeFileSync(temp, data, { flush: true }); renameSync(temp, path);
}
