# Notch — web

Surfaces A (Verify), B (Position), C (Activity). Next.js `--webpack` (never Turbopack),
TypeScript strict, Tailwind, wagmi/viem (never ethers), lucide-react.

No secrets live here. Every address in `src/lib/constants.ts` is a public testnet
contract address; this app never reads the monorepo root `.env`, which holds private
keys for other gates' scripts.

## Run

```
npm run dev --workspace=web
```

Connect a wallet (any injected extension) pointed at Creditcoin CC3 testnet (chain id
`102031`, RPC `https://rpc.cc3-testnet.creditcoin.network`) to act as a lender, and at
Ethereum Sepolia to have created the source stream.

## Independent recompute recipe

`available()` for any claim can be recomputed without this app, straight from
Creditcoin storage, with any RPC client:

```
cast call <REGISTRY_ADDRESS> "claims(bytes32)" <claimId> \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network

cast call <REGISTRY_ADDRESS> "available(bytes32)(uint128)" <claimId> \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network
```

`available` is `originalCapacity - financedCapacity`, both read directly off the
`claims` mapping -- the contract's own arithmetic, not this app's. The in-app page at
`/recompute/[claimId]` runs the same two reads and shows the exact command above.

## Scale note

The money-shot demo position (created by `scripts/create-gate8-demo-position.mjs`) is a
fresh 100,000-deposit Sepolia stream, matching `Notch-PRD v2.md` Appendix E's worked
example. The measurement campaign in Gate 7 (`GATES.md`) used real positions at a
smaller scale (hundreds to low-thousands) -- both are real, decoded, on-chain facts at
their own scale; neither was adjusted to match the other. See `DECISIONS.md` for the
Gate 8 scale decision.
