import Link from "next/link";
import { NotchLogo } from "./notch-logo";
import { REGISTRY_ADDRESS } from "@/lib/constants";

export function SiteFooter() {
  return <footer className="mt-16 border-t border-line bg-ink text-bone"><div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
    <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr]">
      <div><Link href="/" className="inline-flex items-center gap-3 font-display text-2xl"><NotchLogo className="h-7 w-7" />Notch</Link><p className="mt-4 max-w-xs text-sm leading-relaxed text-bone/65">Finance real cashflows across chains.<br />Never twice.</p></div>
      <div><h2 className="text-sm font-medium">Explore</h2><div className="mt-4 flex flex-col items-start gap-3 text-sm text-bone/70"><Link href="/verify">Cashflows</Link><Link href="/docs">Documentation</Link><Link href="/#faq">Questions & answers</Link></div></div>
      <div><h2 className="text-sm font-medium">Networks & contracts</h2><div className="mt-4 flex flex-col items-start gap-3 text-sm text-bone/70"><a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">Ethereum Sepolia</a><a href={`https://creditcoin-testnet.blockscout.com/address/${REGISTRY_ADDRESS}`} target="_blank" rel="noreferrer">Creditcoin CC3 registry</a><Link href="/docs#boundaries">Scope & boundaries</Link></div></div>
    </div><div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-bone/20 pt-6 text-xs leading-relaxed text-bone/60"><p>Testnet only. Tokens have no cash value. No repayment guarantee.</p><p>Ethereum Sepolia / Creditcoin CC3 Testnet</p></div>
  </div></footer>;
}
