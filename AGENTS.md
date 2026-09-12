# Notch standing instructions

Read `RULES.md`, `BUILD_CONTRACT.md`, and the current gate evidence before changes.
The user's later instructions override conflicting PRD text.

## Every frontend build or handoff

- Build and maintain a real landing page at `/`. It is mandatory, not optional scope.
  Include the value proposition, tally-stick story, three-step flow, real evidence
  preview, and **Try the live demo** linking to `/verify`.
- `/verify` must start with a real, usable demo cashflow already loaded. Include
  **Use demo cashflow** to reset it, plain-language help, a source explorer link,
  honest pending/failure states, and an obvious next step. Own-source entry is secondary.
- Never require a visitor to obtain transaction hashes or read a terminal to explore
  the demo. Clearly distinguish existing settlement, read-only checks, and new loans.
- Include these requirements explicitly in any frontend agent prompt or handoff.
- Click the actual UI in a browser on desktop and mobile before reporting completion.
  Installed Chrome plus Playwright can be used even when no browser MCP is available.
  A passing build or RPC script does not prove that buttons work.
- Never fabricate proofs, capacity, settlement, or test outcomes. Keep recorded
  previews labelled; show current figures only from actual verified/on-chain evidence.
- Do not deploy, broadcast new transactions, or commit without current explicit user
  authorization. Do not advance to the next gate without reporting the current exit.
