"use client";

import { WagmiProvider, useReconnect } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";

// WagmiProvider alone does not restore a previously-authorized wallet connection on
// page load -- without this, every refresh drops the connection and the next action
// re-triggers the browser's extension-picker prompt from scratch. wagmi persists which
// connector was last authorized (localStorage, via its default storage), but actually
// reconnecting to it is a separate, explicit step.
function AutoReconnect() {
  const { reconnect } = useReconnect();
  useEffect(() => {
    reconnect();
    // Intentionally once on mount -- reconnect() itself is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AutoReconnect />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
