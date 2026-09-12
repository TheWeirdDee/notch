# Build Contract

This file is the operating contract for building Notch. It restates the non-negotiable
rules from `Notch-PRD.md` (source of truth) in a form checked at each gate.

## Rules

1. No literal emoji anywhere — UI, copy, toasts, logs, commit messages. Icons are
   lucide-react components only.
2. Stack: Next.js 16.2 with `--webpack` (never Turbopack), TypeScript strict, Tailwind,
   wagmi/viem (never ethers), lucide-react. `@gluwa/usc-sdk` pulls in ethers — do not use
   it. Proofs come from the ProofBuilder HTTP API via `fetch`; submission to the
   precompile is via viem.
3. Build in gates (PRD section 20). A later gate starts on a pass rule, not a date.
4. A blocked capability is named `BLOCKED_BY_ATTESTCOIN` with the failing call. Never
   simulated, faked, or dropped.
5. No fabrication: no fake proofs, capacities, fills, or savings. Every capacity number
   traces to a decoded, verified transaction. Every published number has a denominator.
6. No silent fallback from a real Attestcoin-verified source to a self-minted or
   simulated one.
7. Capacity is decoded from the verified transaction, never supplied by a user. This is
   the load-bearing property; if it cannot hold, stop.
8. Evidence may correct the PRD. Record corrections in `DECISIONS.md`. Never silently
   shrink a claim, never quietly drop a feature.
9. After Gate 7, freeze the capacity and conservation math unless a bug produces a wrong
   number.

## Repo layout

```
core/       reference model: capacity decode and conservation, deterministic, no network
contracts/  MockUSDC, AttestedCashflowRegistry, CashflowLendingVenue
adapter/    ProofBuilder HTTP client (fetch), precompile calls (viem), raw payload store
web/        Surfaces A to C (Next.js)
cli/        verify, campaign
data/       ledger.jsonl, receipts/, campaign/
```

## Mode

`notch.config.json` at repo root carries `paper_only`. It is `true` until Gate 6 proves
live micro loans. `PAPER` receipts never add into `LIVE` totals (invariant 7).

## Gate status

Tracked in `GATES.md`. Do not start a gate whose predecessor has not passed its rule.
