import { Plus } from "lucide-react";
export const questions = [
  ["Is this real or a simulation?", "The source streams, Attestcoin proofs, ccUSD transfers and linked reverted transactions are real testnet operations. Live balances are read from Creditcoin. Testnet activity is not a mainnet lending product."],
  ["What does Attestcoin verify?", "Attestcoin supplies the transaction-inclusion proof checked by Creditcoin’s BlockProver precompile. Notch then decodes the proven receipt, checks that the source transaction succeeded, and validates the stream’s amount and lock terms."],
  ["What does “never twice” cover?", "Within this registry and its immutable lending venue, total financing cannot exceed a claim’s verified capacity. Failed transfers cannot consume capacity. A separate registry, off-platform lending, source-chain withdrawals and repayment are outside that guarantee."],
  ["Why start with Sablier?", "Sablier’s lockup creation event exposes a deposit amount, recipient and lock terms that the registry can decode. This build accepts only the allowlisted Sepolia contract, approved asset and supported non-cancelable, non-transferable lock shape."],
  ["Does Notch handle repayment?", "Not in this version. The current build verifies capacity and enforces atomic origination. Repayment, collateral enforcement and outbound source-chain actions are future work; they are not available guarantees."],
  ["Are the funds worth real money?", "No. Both the deposit asset and ccUSD are test tokens with no cash value. Transfers and gas charges occur on Ethereum Sepolia and Creditcoin CC3 Testnet. No mainnet funds are required."],
];
export function FAQ() {
  return <section id="faq" className="grid gap-10 border-t border-line py-16 lg:grid-cols-[1fr_1.6fr]"><div><p className="text-sm text-cut">Questions & answers</p><h2 className="mt-4 font-display text-4xl">Know what you’re<br className="hidden sm:block" /> looking at.</h2><p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">Real evidence, a defined scope, and no hidden promise of repayment.</p></div><div className="border-t border-line">{questions.map(([q,a])=><details key={q} name="faq" className="group border-b border-line"><summary className="flex list-none items-center justify-between gap-5 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">{q}<Plus size={18} className="shrink-0 text-cut transition-transform group-open:rotate-45" /></summary><p className="pb-6 pr-8 text-sm leading-7 text-ink-soft">{a}</p></details>)}</div></section>;
}

