# Notch

Built for BUIDL CTC 2026 Fall on the Attestcoin Protocol. Testnet only — no real
funds move.

**Live: [notch-web-sooty.vercel.app](https://notch-web-sooty.vercel.app/)** — no
wallet needed to browse it, no environment variables were set to deploy it (see
[Deployed addresses](#deployed-addresses) and [`DEPLOYMENT.md`](DEPLOYMENT.md) for why
none are required). **Whitepaper (PDF): [`NOTCH_WHITEPAPER.pdf`](NOTCH_WHITEPAPER.pdf)**
— every address, tx hash and number in this README, in one document, built for judges.

A conservation layer for cross-chain cashflow-backed lending on Creditcoin. It decodes
a real cashflow's financing capacity from a proven Ethereum transaction and enforces,
on-chain, that no combination of lenders can finance more than that capacity.

> "If three different lenders on Creditcoin see the same verified $100k Ethereum cashflow stream, what stops them from lending $70k, $50k, and $40k simultaneously ($160k total) against it?"
>
> Notch is the shared registry that enforces one drawn-down limit: it holds the decoded $100k capacity on-chain, so a $70k loan from Lender A leaves $30k, Lender B takes the $30k remainder, and the fourth dollar past $100k reverts on-chain.

| Network | Tests | Ledger | Track |
|---|---|---|---|
| Creditcoin CC3 testnet + Ethereum Sepolia | 87/87 | 44/44 MATCH | DeFi |

## Contents

- [What it is](#what-it-is)
- [Why Attestcoin is load-bearing, not decorative](#why-attestcoin-is-load-bearing-not-decorative)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup & run](#setup--run)
- [Try it end to end](#try-it-end-to-end)
- [Test](#test)
- [Verify it yourself](#verify-it-yourself)
- [Deployed addresses](#deployed-addresses)
- [Evidence](#evidence)
- [Scope & boundaries](#scope--boundaries)
- [Repo docs](#repo-docs)
- [License](#license)
- [Secret hygiene](#secret-hygiene)

## What it is

Lenders on different chains can't see each other's commitments, so the same verified
cashflow can look available to more than one of them at once and end up financed
twice. Notch closes that gap: it decodes a cashflow's capacity from a proven,
receipt-success Ethereum transaction — never a typed or cached number — and holds that
capacity as one shared, depletable resource in a Creditcoin registry. Every lender
draws from the same balance; a draw past what remains reverts on-chain, regardless of
how many other lenders have already drawn.

The source of that capacity is [Sablier](https://sepolia.etherscan.io/address/0xe61cb9153356419bdaD0A8767c059f92d221a3C4)
— a real, deployed streaming/lockup protocol on Ethereum (`SablierLockup v4.0`,
`0xe61cb9153356419bdaD0A8767c059f92d221a3C4` on Sepolia). Creating a Sablier stream
locks actual ERC-20 tokens into that contract; nothing about the deposit is typed in
or assumed. Attestcoin proves the stream's creation transaction happened and
succeeded, and Notch decodes the locked `depositAmount` directly from that
transaction's own `CreateLockupLinearStream` event — a real, third-party-held lock is
what makes a claim's capacity real. Notch's contracts only ever *read* a Sablier lock
this way; they never create, hold, or control Sablier funds. (The dashboard can
optionally help you create your own compliant stream from your own wallet as a
convenience — see [Try it end to end](#try-it-end-to-end) — but that write still goes
to Sablier's contract, signed by you, never by Notch.)

For the mechanism in depth — the Attestcoin verify/decode path, the claim lifecycle,
and the guarantees-vs-boundaries table — see [`ATTESTCOIN_INTEGRATION.md`](ATTESTCOIN_INTEGRATION.md)
and the in-app `/docs` page (running locally once the app is up, see below).

## Why Attestcoin is load-bearing, not decorative

`instantiateClaim` — the only function on `AttestedCashflowRegistry` that can ever
create a claim — spends its first four lines calling the native BlockProver
precompile's `verifyAndEmit`, and reverts `VerificationFailed()` immediately if that
call returns false, before touching anything else
([`contracts/src/AttestedCashflowRegistry.sol:178-185`](contracts/src/AttestedCashflowRegistry.sol)).
Every check after it — receipt-success, event decode, source-contract allowlist,
lock-shape rules — runs on data that only exists because that precompile call already
succeeded. There is no second path in: no owner-set override, no admin mint, no
`onlyOwner` modifier anywhere in either contract (checked directly against the
deployed source, not assumed). `venue` is `immutable`, and `setVenue` is a permanent,
unconditional revert stub kept only so the call site still resolves — a deliberate,
documented lockdown (`DECISIONS.md` D22/D23), not an oversight.

That's checkable in one read, not just asserted: `available()` is always
`originalCapacity − financedCapacity`, and `originalCapacity` is only ever written
inside `instantiateClaim`, after the verify step above passes
([Verify it yourself](#verify-it-yourself) below shows the exact `cast call`). Take
the attestation away — an invalid proof, a wrong chain key, an unattested block — and
this contract has no other way to create capacity for anyone to finance against.

## Architecture

| Package | Role |
|---|---|
| `core/` | Pure, deterministic reference model — capacity decode and conservation rules, no network or clock access. |
| `adapter/` | ProofBuilder HTTP client, viem-based precompile calls, proof assembly, and the append-only receipt ledger. |
| `cli/` | `notch verify`, `notch recover`/`paper`, `notch deployment-check` — run via `npx tsx cli/src/index.ts <command>`. |
| `contracts/` | Solidity: `MockUSDC` (ccUSD), `AttestedCashflowRegistry`, `CashflowLendingVenue`. |
| `web/` | The Next.js dashboard — Verify, Position, Activity, Docs. |
| `data/` | The append-only receipt ledger (`ledger.jsonl`) and per-gate evidence. |

```
Ethereum Sablier tx
  -> Attestcoin proof (ProofBuilder) + BlockProver precompile verification
  -> receipt-status + event decode -> claim instantiated on Creditcoin
  -> finance(): capacity consumed and ccUSD transferred atomically
  -> conservation enforced -- no combination of lenders can exceed the decoded capacity
```

## Prerequisites

- Node.js >= 20, npm.
- [Foundry](https://getfoundry.sh) (`cast`) — only needed for the independent
  `cast call` verification example below; not required to run or test the app.
- A funded Creditcoin CC3 testnet wallet (native gas + ccUSD) and a browser wallet
  extension — only needed to send a real `finance()` transaction from the dashboard;
  reading a position needs neither.

## Setup & run

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Reading a position needs no wallet — every figure on
Position and Activity is a live Creditcoin read; connecting a wallet only enables
sending a `finance()` transaction, it never changes what's displayed.

## Try it end to end

A copy-pasteable path through the whole system, from source transaction to on-chain
enforcement, with what to expect at every step:

1. `npm ci && npm run dev` — start the app. No wallet, API key, or `.env` edit is
   needed to look at anything below.
2. Open `http://localhost:3000/verify`. You'll see a dashboard already loaded with a
   real demo cashflow (Sablier stream #189, Ethereum Sepolia) — live capacity,
   financed and remaining figures at the top, and the source transaction, recipient
   and lock expiry below them, all read from the deployed Creditcoin registry. (A
   connected Sepolia wallet can instead click **Create a demo cashflow** to lock a
   fresh Sablier stream of its own and skip straight to step 3 with it — real, not
   simulated; see `DECISIONS.md`.)
3. Click **Verify with Attestcoin**. Watch the status line move through fetching a
   fresh Attestcoin proof of the source transaction, then checking that proof against
   the live Creditcoin verifier — this claim is already active, so verification
   reuses it rather than re-instantiating it.
4. Look at the top of the same page: capacity **100,000**, financed **70,000**,
   remaining **30,000** — read live from the registry contract, not typed in.
5. Scroll down: **Latest settled loan** links the real 70,000 ccUSD finance
   transaction on Blockscout, and **Reverted transactions** links a real, independent
   50,000 draw against the same claim that was mined and reverted on-chain — not a
   simulated preview.
6. Optionally, connect a funded Creditcoin CC3 testnet wallet (native gas + ccUSD) and
   use the **Finance this cashflow** panel to send your own `finance()` call. Watch
   the remaining-capacity figure at the top drop by exactly what you sent.
7. Verify any of it yourself, independent of this app, with the CLI:
   `npx tsx cli/src/index.ts verify <receipt_id>` recomputes a ledger receipt from its
   own recorded proof inputs against the pure reference model (see
   [Verify it yourself](#verify-it-yourself) below for the full recipe, including a
   direct `cast call` against the live contract).

## Test

```sh
npm test                                          # core + adapter + contracts: 87/87
node --import tsx scripts/verify-all-receipts.ts  # full ledger: 44/44 MATCH
npx tsx cli/src/index.ts deployment-check         # confirms deployed addresses match the manifest
npm run build                                     # production build of web/
```

## Verify it yourself

Recompute any ledger receipt independently, from its own recorded proof inputs, via
the pure reference model — not the app's own arithmetic:

```sh
npx tsx cli/src/index.ts verify <receipt_id>       # one receipt, from data/ledger.jsonl
node --import tsx scripts/verify-all-receipts.ts   # every receipt in the ledger
```

Or read a live claim's capacity straight from Creditcoin storage, independent of this
app entirely — `available()` is always `originalCapacity - financedCapacity`, computed
by the registry contract itself:

```sh
cast call 0x68952727aa2e684bec378120a651434b1de5e915 \
  "available(bytes32)(uint128)" <claimId> \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network
```

(`0x68952727aa2e684bec378120a651434b1de5e915` is the `AttestedCashflowRegistry` — see
the address table below.)

## Deployed addresses

| Contract | Network | Address |
|---|---|---|
| `AttestedCashflowRegistry` | Creditcoin CC3 testnet | [`0x68952727aa2e684bec378120a651434b1de5e915`](https://creditcoin-testnet.blockscout.com/address/0x68952727aa2e684bec378120a651434b1de5e915) |
| `CashflowLendingVenue` | Creditcoin CC3 testnet | [`0x5CEB2357eCC2fcA5eA77057ce8D74646E0C76493`](https://creditcoin-testnet.blockscout.com/address/0x5CEB2357eCC2fcA5eA77057ce8D74646E0C76493) |
| `MockUSDC` (ccUSD) | Creditcoin CC3 testnet | [`0x92db42991210a8f5a4c1de2ad36f10ef239f3498`](https://creditcoin-testnet.blockscout.com/address/0x92db42991210a8f5a4c1de2ad36f10ef239f3498) |
| Sablier Lockup v4.0 (allowlisted source) | Ethereum Sepolia | [`0xe61cb9153356419bdaD0A8767c059f92d221a3C4`](https://sepolia.etherscan.io/address/0xe61cb9153356419bdaD0A8767c059f92d221a3C4) |

These are the single source of truth for addresses; `web/src/lib/constants.ts` and
`.env` both resolve to the same values, confirmed by `deployment-check` above.

## Evidence

One real position, followed end to end (Sablier stream 189, Ethereum Sepolia, 100,000
deposit — currently active, unlocks 2026-10-12):

- **Source** — the real Sepolia transaction the capacity was decoded from:
  [`0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa`](https://sepolia.etherscan.io/tx/0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa)
- **Instantiate** — the real Creditcoin transaction that verified it and created the claim:
  [`0x2f2ada0a4d1b0f0030227de7b464c94e723d524815b21c67dfed45362aefeffe`](https://creditcoin-testnet.blockscout.com/tx/0x2f2ada0a4d1b0f0030227de7b464c94e723d524815b21c67dfed45362aefeffe)
- **Finance** — a real 70,000 ccUSD loan, transferred and capacity-consumed atomically:
  [`0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978`](https://creditcoin-testnet.blockscout.com/tx/0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978)
- **Refused** — a second, independent lender requesting 50,000 against the 30,000 that
  remained, mined and reverted on-chain, not a preview:
  [`0x62cb553555d429951b88b9fc38459b1f57cdc2225ee0a1254edece662a4a8b93`](https://creditcoin-testnet.blockscout.com/tx/0x62cb553555d429951b88b9fc38459b1f57cdc2225ee0a1254edece662a4a8b93)

**3,280 units of over-financing prevented** across a frozen, real, 5-position
measurement campaign — full shared conservation vs. a per-lender-ceiling baseline,
same real decoded capacities, same fixed draw plan, on these deployed contracts.
Denominator: 5 positions × 4 draw steps each × 3 funded lenders. Full campaign, every
receipt id, and the ablation table: [`GATES.md` Gate 7](GATES.md#gate-7--frozen-set-locked-before-any-result-exists-2026-09-10).

## Scope & boundaries

This build proves capacity conservation and atomic, real-time origination. It does
not provide repayment, collateral recovery, or outbound writes back to the source
chain — Attestcoin's current release is read-only, Ethereum to Creditcoin, and
repayment is v2 scope. All tokens involved (the deposit asset, ccUSD) are testnet-only
with no cash value. Full guarantees-vs-boundaries table: [`ATTESTCOIN_INTEGRATION.md`](ATTESTCOIN_INTEGRATION.md).

Third-party IP: every contract in `contracts/src/` is original to this repo. Nothing
here forks or vendors another team's codebase. Official Gluwa/Creditcoin repositories
(`gluwa/creditcoin3`'s precompile ABIs, `gluwa/USC-Builder-Examples`'s
`EvmV1Decoder.sol`) were read as public interface references during development —
never copied wholesale, never run at build or runtime (`DECISIONS.md` records exactly
which ones and why). `@gluwa/usc-sdk` is deliberately not a dependency anywhere in
this repo (it pulls in `ethers`, which this project avoids entirely); Sablier and
Creditcoin's own precompiles are called directly, by address, against their published
interfaces.

## Repo docs

- [`NOTCH_WHITEPAPER.pdf`](NOTCH_WHITEPAPER.pdf) — the project deck/whitepaper for
  judges: problem, mechanism, deployed addresses, and the full evidence ledger, in one
  document. Source: [`docs/whitepaper.html`](docs/whitepaper.html), rendered via
  `node web/scripts/render-whitepaper.mjs`.
- [`ATTESTCOIN_INTEGRATION.md`](ATTESTCOIN_INTEGRATION.md) — the verify -> decode ->
  instantiate path, the calldata-fallback boundary, and the guarantees table.
- [`GATES.md`](GATES.md) — every gate, every real transaction, every finding.
- [`DECISIONS.md`](DECISIONS.md) — implementation decisions, append-only.
- [`CLAIMS.md`](CLAIMS.md) — claims and their limitations.
- [`AGENTS.md`](AGENTS.md) — standing build instructions.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deploying the web app.
- `/docs` in the running app — the same integration depth, browsable.

## License

[MIT](LICENSE).

## Secret hygiene

Environment files, private keys, and logs are excluded from Git. Every transaction
hash, contract address, and receipt referenced above is public testnet evidence.
