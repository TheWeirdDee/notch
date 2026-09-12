# Notch

**3,280 units of over-financing prevented** across a frozen, real, 5-position measurement
set — full conservation vs. a per-lender-ceiling baseline, same real decoded capacities,
same fixed draw plan, on real Creditcoin CC3 testnet contracts. Denominator: 5 positions
× 4 draw steps each × 3 funded lenders. Full campaign, every receipt id, and the
ablation table: [`GATES.md` Gate 7](GATES.md#gate-7--frozen-set-locked-before-any-result-exists-2026-09-10).

Notch is a conservation layer for cross-chain cashflow-backed lending: it decodes a
verified real-world cashflow's capacity from a proven Ethereum transaction, then
enforces that no combination of lenders can finance more than that capacity, ever,
inside its own registry on Creditcoin.

## See it happen, live, on real testnet infrastructure

One real position (Sablier stream 189, Ethereum Sepolia, 100,000 deposit):

- **Source** — the real Sepolia transaction the capacity was decoded from:
  `0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa`
  ([Sepolia Etherscan](https://sepolia.etherscan.io/tx/0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa))
- **Instantiate** — the real Creditcoin transaction that verified it and created the claim:
  `0x2f2ada0a4d1b0f0030227de7b464c94e723d524815b21c67dfed45362aefeffe`
  ([Blockscout](https://creditcoin-testnet.blockscout.com/tx/0x2f2ada0a4d1b0f0030227de7b464c94e723d524815b21c67dfed45362aefeffe))
- **Finance** — a real 70,000 ccUSD loan, transferred and capacity-consumed atomically:
  `0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978`
  ([Blockscout](https://creditcoin-testnet.blockscout.com/tx/0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978))

A second, independent lender then requesting 50,000 against the 30,000 that remained
was refused for real, on-chain — mined, reverted, not a preview:
`0x62cb553555d429951b88b9fc38459b1f57cdc2225ee0a1254edece662a4a8b93`
([Blockscout](https://creditcoin-testnet.blockscout.com/tx/0x62cb553555d429951b88b9fc38459b1f57cdc2225ee0a1254edece662a4a8b93)).

Live, current numbers for this exact position — no wallet required to view — at
`/position/0x3fed0d1620134bb777847debb9f2bb9f7c455668f67b03c780f0f6896c0a0a48`
once the app is running (below).

## Verify a receipt yourself

Every ledger receipt recomputes independently, from its own recorded proof inputs,
via the pure reference model — not the app's own arithmetic:

```sh
npx tsx cli/src/index.ts verify <receipt_id>   # one receipt, e.g. any id in data/ledger.jsonl
node --import tsx scripts/verify-all-receipts.ts   # every receipt in the ledger
```

Or recompute a live claim's capacity directly from Creditcoin storage, independent of
this app entirely:

```sh
cast call 0x68952727aa2e684bec378120a651434b1de5e915 \
  "available(bytes32)(uint128)" <claimId> \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network
```

Full recipe and the honest guarantees-vs-boundaries table: [`ATTESTCOIN_INTEGRATION.md`](ATTESTCOIN_INTEGRATION.md).

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Reading positions does not require a wallet — every figure
on Position and Activity is a live Creditcoin read; connecting a wallet only enables
sending a `finance()` transaction, it never changes what's displayed.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel setup. The web app requires no
environment variables or server-side private keys.

## Test

```sh
npm test                                          # core + adapter + contracts, 87/87
node --import tsx scripts/verify-all-receipts.ts  # full ledger, 44/44 MATCH
npx tsx cli/src/index.ts deployment-check
npm run build
```

## Further reading

- [Attestcoin integration, in depth](ATTESTCOIN_INTEGRATION.md) — the verify → decode →
  instantiate path, the calldata-fallback boundary, and the guarantees table.
- [Gate evidence](GATES.md) — every gate, every real transaction, every finding.
- [Implementation decisions](DECISIONS.md)
- [Claims and limitations](CLAIMS.md)
- [Standing build instructions](AGENTS.md)

## Scope

This build proves capacity conservation and real-time, atomic origination. It does
not provide repayment, collateral recovery, or outbound writes back to the source
chain — Attestcoin's current release is read-only, Ethereum to Creditcoin, and
repayment is v2 scope. All tokens involved (the deposit asset, ccUSD) are testnet-only
with no cash value.

Local environment files, private keys, logs and build output are excluded from Git.
Published transaction hashes, contract addresses and receipts are public testnet
evidence.
