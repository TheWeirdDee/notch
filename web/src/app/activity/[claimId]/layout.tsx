import type { Metadata } from "next";

function shortId(id: string): string {
  return /^0x[0-9a-fA-F]{10,}$/.test(id) ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
}

export async function generateMetadata({ params }: { params: Promise<{ claimId: string }> }): Promise<Metadata> {
  const { claimId } = await params;
  return {
    title: `Activity ${shortId(claimId)}`,
    description: "Settled LoanOriginated events and mined refusal receipts for a cashflow claim, read live from the deployed Creditcoin venue.",
  };
}

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
