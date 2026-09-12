# notch

Finance real cashflows across chains. Never twice.

Notch verifies supported Sablier lockups on Ethereum Sepolia and enforces shared
financing capacity through a registry and lending venue on Creditcoin CC3 Testnet.
All tokens are test assets. Repayment and off-platform financing are outside scope.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Reading positions does not require a wallet. A connected
wallet is needed only for actions that sign transactions.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel setup. The current web app requires no
environment variables or server-side private keys.

## Verify

```sh
npm test
node --import tsx scripts/verify-all-receipts.ts
npx tsx cli/src/index.ts deployment-check
npm run build
```

- [Gate evidence](GATES.md)
- [Implementation decisions](DECISIONS.md)
- [Claims and limitations](CLAIMS.md)
- [Standing build instructions](AGENTS.md)

Local environment files, private keys, logs and build output are excluded from Git.
Published transaction hashes, contract addresses and receipts are public testnet evidence.
