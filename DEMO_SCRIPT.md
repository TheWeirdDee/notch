# Demo video script — 90 seconds

Not recorded by this session (no browser/screen-recording tool available). Written so
whoever records it can do so with minimal risk: every segment either shows already-real,
already-settled evidence (stream 189, fully instantiated/financed/refused as of
2026-09-12) or a short, reliable live action — nothing here requires a long attestation
wait during the recording itself. Two distinct wallets throughout; never the same key as
both lenders.

Run `npm run dev`, open `http://localhost:3000`, and have two browser profiles (or two
wallet accounts) ready — Lender A and Lender B — before you start recording.

---

## 0:00–0:12 — The problem (voiceover over the landing page)

Show: `/` (landing page), scroll from hero into the "Credit needs a common record" /
"why" section.

> "A cashflow can cross chains. But if two lenders on different chains can't see each
> other, the same future payment can look available to both of them — and get financed
> twice."

## 0:12–0:30 — The real source (Sepolia)

Show: `/verify`. Point at the preloaded stream (#189, 100,000 deposit). Click "View
source transaction on Ethereum" — the real Sepolia Etherscan page opens in a new tab.

> "This is a real Sablier stream on Ethereum Sepolia — locked, non-cancelable, a real
> 100,000-token deposit. Notch reads its capacity from this transaction. Nothing is
> typed in."

Tx to show resolving: `0x1e7d304d9d8ed1bb4ef54961c2d5551b35c224403fa46de30bb9cb28144a81fa`

## 0:30–0:45 — Attestcoin verify + receipt check

Show: click "Verify cashflow" (or, since 189 is already active, the page's "already
active, reused" state is fine to show honestly — say so on camera rather than re-staging
a fresh instantiate). If a fresh instantiate is preferred for a cleaner beat, create one
new compliant stream beforehand (see `scripts/create-gate9-demo-position.mjs`) and
verify *that* one live instead — attestation typically resolves within a few minutes, so
either fetch its proof well before recording starts, or accept a short pause/cut here.

> "Attestcoin's BlockProver proves this transaction was really included and succeeded on
> Ethereum. Notch checks that separately from inclusion — a proven-but-failed
> transaction creates zero capacity."

## 0:45–1:05 — Lender A finances (real transfer)

Show: switch to the Lender A wallet, `/position/0x3fed0d1620134bb777847debb9f2bb9f7c455668f67b03c780f0f6896c0a0a48`.
Point at the live "Verified capacity / Financed / Remaining" tiles (100,000 / 70,000 /
30,000) and the "Most recent settled loan" panel. Click "View transaction" — real
Blockscout page opens.

> "Lender A financed 70,000 — a real ccUSD transfer to the borrower, settled atomically
> with the capacity reduction, on Creditcoin."

Tx to show resolving: `0x442e69ef2ca5122d686834e1db867a587bc23ca35178bdd1d9d0c4a541fb8978`

## 1:05–1:25 — Lender B's over-draw is refused, for real

Show: switch to the Lender B wallet (visibly a different address). Scroll to "Reverted
transactions" on the same position page — point at the real mined-and-reverted refusal
row, click "View reverted transaction on Blockscout."

> "A second, independent lender — a different wallet — asked for 50,000 against the
> 30,000 that remained. This isn't a preview. It's a real transaction, mined, and
> reverted on-chain, because Creditcoin enforces one shared limit across every lender."

Tx to show resolving: `0x62cb553555d429951b88b9fc38459b1f57cdc2225ee0a1254edece662a4a8b93`

## 1:25–1:30 — Recap (voiceover, hold on the boundaries table at `/docs#boundaries`)

> "One verified cashflow. One shared, conserved limit. Real transfers, real refusals,
> nothing hardcoded — and it stops exactly where it says it does: this proves capacity
> conservation, not repayment."

---

## Do not

- Show a static/hardcoded number as if it were a live read — every figure on-screen
  should be the app's own live UI, not a slide.
- Use the same wallet for both Lender A and Lender B.
- Present the "reverted transactions" panel or a `simulateContract` preview as the
  headline refusal if it hasn't actually been mined — the two transactions above
  (`0x62cb5535...`) already are; use them, don't restage a preview in their place.
- Claim repayment, credit scoring, or anything from the "receivables as v2" direction
  as something this build does today.
