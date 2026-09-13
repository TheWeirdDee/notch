"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { NotchLogo } from "./notch-logo";
import { useCurrentClaim } from "@/lib/use-current-claim";
import { shortAddress, shortErrorMessage } from "@/lib/format";
import { cc3Testnet } from "@/lib/chains";
import { DEMO } from "@/lib/demo";
import { usePathname } from "next/navigation";

// A wallet extension's own popup can be dismissed, blocked, or simply never respond
// (most often when more than one injected wallet is fighting over window.ethereum) --
// none of that rejects wagmi's connect() promise, so relying on its own isPending
// alone can leave the button reading "Connecting..." forever with no way out. Racing
// it against a hard timeout guarantees the button always recovers and always says why.
const CONNECT_TIMEOUT_MS = 20_000;

export function NavBar() {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const pathname = usePathname();
  const { disconnect } = useDisconnect();
  const { claimId } = useCurrentClaim();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  async function handleConnect() {
    if (!connectors[0] || connecting) return;
    setConnectError(null);
    setConnecting(true);
    try {
      await Promise.race([
        connectAsync({ connector: connectors[0] }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timed out. Check your wallet extension for a pending request or popup, or try again.")), CONNECT_TIMEOUT_MS)),
      ]);
    } catch (err) {
      setConnectError(shortErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  }

  const onWrongNetwork = isConnected && chainId !== cc3Testnet.id;
  const navLinkClass = "relative py-1 text-ink-soft hover:text-ink aria-[current=page]:text-ink after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-cut after:transition-transform aria-[current=page]:after:scale-x-100";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bone">
      {onWrongNetwork && (
        <div className="bg-cut/10 px-6 py-2 text-center text-sm text-cut">
          Your wallet is on the wrong network.{" "}
          <button onClick={() => switchChain({ chainId: cc3Testnet.id })} className="underline">
            Switch to Creditcoin CC3 Testnet
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-10">
        <div className="flex flex-wrap items-center gap-5 sm:gap-8">
          <Link href="/" className="flex items-center gap-2">
            <NotchLogo className="h-6 w-6 text-ink" />
            <span className="font-display text-lg font-medium">Notch</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm sm:gap-6">
            <Link href="/verify" aria-current={pathname === "/verify" ? "page" : undefined} className={navLinkClass}>
              Verify
            </Link>
            <Link
              href={`/position/${claimId || DEMO.claimId}`}
              aria-current={pathname.startsWith("/position") ? "page" : undefined}
              className={navLinkClass}
            >
              Position
            </Link>
            <Link
              href={`/activity/${claimId || DEMO.claimId}`}
              aria-current={pathname.startsWith("/activity") ? "page" : undefined}
              className={navLinkClass}
            >
              Activity
            </Link>
            <Link href="/docs" aria-current={pathname.startsWith("/docs") ? "page" : undefined} className={navLinkClass}>
              Docs
            </Link>
          </nav>
        </div>
        {isConnected && address ? (
          <button
            onClick={() => disconnect()}
            className="tabular-nums rounded-sm border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink"
          >
            {shortAddress(address)}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!connectors[0] || connecting}
            className="rounded-sm border border-line px-3 py-1.5 text-sm hover:border-ink disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
      {connectError && <p role="alert" className="mx-auto max-w-6xl px-6 pb-3 text-sm text-cut">{connectError} You can still explore every page without a wallet.</p>}
    </header>
  );
}
