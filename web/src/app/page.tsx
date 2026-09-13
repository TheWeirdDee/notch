import Link from "next/link";
import { ScanLine, Landmark, ShieldCheck, Users, Layers } from "lucide-react";
import { DEMO } from "@/lib/demo";
import { PositionMetrics } from "@/components/position-metrics";
import { FAQ } from "@/components/faq";
import { SmoothScroll } from "@/components/smooth-scroll";
import { SEPOLIA_EXPLORER_TX, REGISTRY_ADDRESS } from "@/lib/constants";

export default function HomePage() {
  return <div className="mx-auto max-w-6xl px-6 sm:px-10">
    <SmoothScroll />
    <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-24">
      <div>
        <p className="mb-5 text-sm text-cut">Cashflow-backed lending on Creditcoin</p>
        <h1 className="font-display text-5xl leading-[1.08] tracking-tight sm:text-6xl">Finance real cashflows across chains.<br /><span className="text-cut">Conserved on-chain.</span></h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">Notch decodes a cashflow&rsquo;s financing capacity from a proven Ethereum transaction and enforces on Creditcoin that no combination of lenders can exceed it.</p>
        <div className="mt-8 flex flex-wrap items-center gap-5"><Link href="/verify" className="bg-ink px-6 py-3 text-sm text-bone">Try the live demo</Link><Link href="/docs" className="text-sm underline underline-offset-4">Read the documentation</Link></div>
        <p className="mt-4 text-xs text-ink-soft">Live testnet contracts. Explore without connecting a wallet.</p>
      </div>
      <div className="min-w-0 border-l-2 border-cut pl-5 sm:pl-7"><p className="mb-4 text-sm">Sablier stream #{DEMO.streamId}</p><PositionMetrics claimId={DEMO.claimId} /><p className="mt-4 text-xs leading-relaxed text-ink-soft">Current on-chain capacity. Refreshed from the deployed registry, independent of your wallet.</p></div>
    </section>

    <section id="the-question" className="border-t border-line py-14">
      <p className="text-sm text-cut">The core problem</p>
      <div className="mt-6 border-l-2 border-cut pl-6 sm:pl-8 py-2">
        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl leading-snug text-ink">
          &ldquo;If three different lenders on Creditcoin see the same verified $100k Ethereum cashflow stream, what stops them from lending $70k, $50k, and $40k simultaneously ($160k total) against it?&rdquo;
        </h2>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-soft">
          Notch decodes the $100k from the proven Ethereum transaction and enforces that the sum of all lenders&rsquo; financing can never exceed it &mdash; $70k leaves $30k, and the next draw is refused on-chain.
        </p>
      </div>
    </section>

    <section id="what" className="border-t border-line py-14">
      <p className="text-sm text-cut">What is Notch?</p>
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <div className="space-y-4 text-lg leading-relaxed text-ink-soft">
          <p className="text-ink">Notch decodes a real cashflow&rsquo;s financing capacity from a proven Ethereum transaction, then enforces on Creditcoin that no combination of lenders can finance more than that capacity.</p>
          <p>The input is a verified, non-cancelable <a href="https://sepolia.etherscan.io/address/0xe61cb9153356419bdaD0A8767c059f92d221a3C4" target="_blank" rel="noreferrer" className="text-ink underline">Sablier</a> cashflow lock on Ethereum &mdash; Sablier is a real, deployed streaming/lockup protocol (SablierLockup v4.0); creating a stream locks actual ERC-20 tokens in its contract. That&rsquo;s why the capacity is a real, third-party-held deposit, never a number anyone typed in: Attestcoin proves the stream&rsquo;s creation transaction, and Notch decodes the locked amount straight from that transaction&rsquo;s own <code className="font-mono text-sm">CreateLockupLinearStream</code> event. The output is one shared financing capacity that lenders on Creditcoin draw from together.</p>
          <p>It guarantees one thing, on-chain: the sum of every loan against a cashflow can never exceed the capacity decoded from that cashflow&rsquo;s proven transaction. Not through convention or an off-chain check &mdash; the registry contract enforces it, and a draw past what remains reverts.</p>
        </div>
        <div className="panel p-6"><p className="text-sm font-medium">What this build does not do</p><p className="mt-3 text-sm leading-relaxed text-ink-soft">Repayment and collateral recovery are not implemented &mdash; they are v2 scope. Notch enforces financing capacity; it does not yet manage what happens after a loan is made.</p></div>
      </div>
    </section>

    <section id="problem" className="border-t border-line py-14">
      <p className="text-sm text-cut">The problem</p>
      <div className="mt-5 max-w-3xl space-y-4 text-lg leading-relaxed text-ink-soft">
        <p>The same future cashflow can be financed twice by lenders who can&rsquo;t see each other&rsquo;s books &mdash; a documented multi-billion-dollar failure in receivables finance.</p>
        <p>When the asset can also cross chains, an already-financed position can look untouched on the new chain. A lender on Creditcoin has no way to know what a lender on Ethereum has already committed against the same cashflow.</p>
      </div>
    </section>

    <section id="who" className="border-t border-line py-14">
      <p className="text-sm text-cut">Who this is for</p>
      <p className="mt-3 max-w-2xl text-ink-soft leading-relaxed">Anyone who has to trust that a cashflow hasn&rsquo;t already been drawn against, across chains they can&rsquo;t independently audit.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">{[[Users,"Lenders & underwriters","Assess a verifiable source and see exactly how much of it other lenders have already financed before committing funds."],[Layers,"Creditcoin's credit ecosystem","Build lending venues around one shared, enforceable capacity instead of isolated, unverifiable balance sheets."]].map(([Icon,title,copy])=>{const I=Icon as typeof Users;return <div className="panel p-7" key={String(title)}><I size={24} strokeWidth={1.5} className="text-cut" /><h3 className="mt-5 font-display text-2xl">{String(title)}</h3><p className="mt-3 text-sm leading-relaxed text-ink-soft">{String(copy)}</p></div>;})}</div>
    </section>

    <section id="how" className="border-t border-line py-14">
      <p className="text-sm text-cut">How it works</p>
      <h2 className="mt-3 font-display text-3xl">Verify, finance, enforce.</h2>
      <div className="mt-9 grid gap-8 md:grid-cols-3">{[{Icon:ScanLine,title:"Verify",copy:"Attestcoin proves a real Sablier lock's creation transaction is included and succeeded; the registry decodes the locked deposit straight from its CreateLockupLinearStream event, never a typed number."},{Icon:Landmark,title:"Finance",copy:"A lender calls finance(): ccUSD transfers to the borrower and capacity is consumed, atomically, in one Creditcoin transaction."},{Icon:ShieldCheck,title:"Enforce",copy:"Every other lender sees the same remaining balance. A draw past what's left reverts on-chain, every time."}].map(({Icon,title,copy})=><div key={title}><Icon size={24} strokeWidth={1.5} className="text-cut" /><h3 className="mt-4 font-display text-2xl">{title}</h3><p className="mt-3 text-sm leading-relaxed text-ink-soft">{copy}</p></div>)}</div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border border-line p-6"><div><h3 className="font-display text-2xl">Inspect the evidence.</h3><p className="mt-2 text-sm text-ink-soft">The source, registry and transaction history are public.</p></div><div className="flex flex-wrap gap-5 text-sm underline underline-offset-4"><a href={SEPOLIA_EXPLORER_TX(DEMO.sourceTx)} target="_blank" rel="noreferrer">Sepolia source</a><a href={`https://creditcoin-testnet.blockscout.com/address/${REGISTRY_ADDRESS}`} target="_blank" rel="noreferrer">Creditcoin registry</a><Link href={`/activity/${DEMO.claimId}`}>Live activity</Link></div></div>
    </section>

    <aside className="border-t border-line py-10 text-sm leading-relaxed text-ink-soft"><p><span className="text-ink">Why &ldquo;Notch&rdquo;:</span> a tally stick was notched to record a debt, then split so each side held matching proof. This build keeps that same idea on-chain &mdash; every draw leaves a mark both sides can check. <Link href="/docs#boundaries" className="underline underline-offset-4">Read the scope of the guarantee</Link>.</p></aside>

    <FAQ />
  </div>;
}
