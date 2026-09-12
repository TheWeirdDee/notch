import { mkdirSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { keccak256, stringToBytes } from "viem";
export async function withStoreLock<T>(directory: string, work: () => Promise<T>, wait = false): Promise<T> {
  mkdirSync(directory, { recursive: true });
  const identity = keccak256(stringToBytes(realpathSync(directory).toLowerCase()));
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\notch-${identity}` :
    { host: "127.0.0.1", port: 20000 + Number(BigInt(identity) % 30000n), exclusive: true };
  const start = Date.now();
  for (;;) {
    const lease = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        lease.once("error", reject);
        if (typeof endpoint === "string") lease.listen(endpoint, resolve); else lease.listen(endpoint, resolve);
      });
    } catch (e) {
      if (!wait || (e as NodeJS.ErrnoException).code !== "EADDRINUSE" || Date.now() - start >= 30000) throw e;
      await new Promise(r => setTimeout(r, 20)); continue;
    }
    try { return await work(); }
    finally { await new Promise<void>((resolve, reject) => lease.close(e => e ? reject(e) : resolve())); }
  }
}
