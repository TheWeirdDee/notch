import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { sepolia } from "wagmi/chains";
import { cc3Testnet } from "./chains";

// Only two chains, matching the two real networks this app ever touches: Sepolia (the
// source of the Sablier stream, read-only from here) and CC3 testnet (where instantiate
// and finance actually happen). No wallet abstraction beyond a plain injected connector
// -- a judge connects whatever wallet extension they have.
export const wagmiConfig = createConfig({
  chains: [cc3Testnet, sepolia],
  connectors: [injected()],
  // Explicit timeout: the default is generous enough that a slow eth_getLogs call (the
  // public CC3 RPC times out entirely on a 100,000-block range -- confirmed directly)
  // would otherwise hang the UI for minutes across viem's retry/backoff before failing.
  // Fail fast instead; callers decide what a timeout means for their specific query.
  transports: {
    [cc3Testnet.id]: http(undefined, { timeout: 8_000 }),
    [sepolia.id]: http(undefined, { timeout: 8_000 }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
