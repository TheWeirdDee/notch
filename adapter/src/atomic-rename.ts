import { renameSync } from "node:fs";

/** Windows scanners can briefly hold a destination open. Retry the atomic rename,
 * never unlink the destination: readers must see a complete old or new journal.
 * Persistent errors leave the original and temporary evidence intact and fail closed.
 */
export function atomicRename(from: string, to: string, rename = renameSync): void {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try { rename(from, to); return; }
    catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 20 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) throw err;
      Atomics.wait(pause, 0, 0, 20);
    }
  }
}
