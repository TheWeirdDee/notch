import type { Metadata } from "next";

function shortId(id: string): string {
  return /^0x[0-9a-fA-F]{10,}$/.test(id) ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
}

export async function generateMetadata({ params }: { params: Promise<{ claimId: string }> }): Promise<Metadata> {
  const { claimId } = await params;
  return {
    title: `Recompute ${shortId(claimId)}`,
    description: "Independently recompute a cashflow claim's current capacity straight from Creditcoin registry storage, outside this app's own arithmetic.",
  };
}

export default function RecomputeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
