"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";

// Wallet connection is deliberately user-initiated only (the nav bar's "Connect
// wallet" button), never attempted automatically on page load. An unsolicited
// reconnect() call against the generic injected connector is ambiguous whenever more
// than one wallet extension is present (e.g. MetaMask + Phantom both hook
// window.ethereum), and browsers surface that ambiguity as an extension-side
// "which wallet?" picker on every single page refresh -- including on pages that
// never need a wallet at all. Every page here already reads live state with no
// wallet connected; requiring an explicit click to connect avoids that prompt.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
