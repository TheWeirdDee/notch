import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify a Cashflow",
  description: "Verify a Sablier cashflow with Attestcoin against the live Creditcoin verifier, watch live capacity, and finance it directly from your wallet.",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
