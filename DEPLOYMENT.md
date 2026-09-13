# Deploying the web app to Vercel

- Import `TheWeirdDee/notch` and select branch `main`.
- Framework preset: **Next.js**.
- Root Directory: **web**.
- Build Command: **npm run build** (uses `next build --webpack`).
- Output Directory: keep the Next.js default.
- Use the repository's npm workspace/lockfile for dependency installation. Enable
  inclusion of files outside the root directory if Vercel presents that option.

## Environment variables

**None are required by the current web app.** Public chain IDs, RPC URLs, ProofBuilder
URL and deployed addresses are in `web/src/lib/constants.ts` and `chains.ts`.
Wallet signatures happen in the connected user's wallet.

Do not upload the root `.env`, `web/.env.local`, any lender/private key, or
`SECOND_LENDER_PRIVATE_KEY`. The old server-funded overdraw endpoint has been removed;
refusal evidence now comes from an already-mined transaction, checked against live
chain receipts. `NOTCH_NEXT_DIR` is only a local build-isolation override: leave it
unset on Vercel so Next.js uses `.next`.

## Runtime limits

The app depends on public Sepolia/CC3 RPC and ProofBuilder availability. Failed reads
are shown as unavailable; there is no snapshot fallback. The preloaded stream is
Sablier #189 (`web/src/lib/demo.ts`); its lock expires October 12, 2026 at 15:32:19
UTC. After expiry, its historical position and mined evidence remain readable, but
fresh activation checks and new financing refuse it. Replacing the source requires a
separately authorized on-chain action.
