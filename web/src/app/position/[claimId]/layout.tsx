import type { Metadata } from "next";

function shortId(id: string): string {
  return /^0x[0-9a-fA-F]{10,}$/.test(id) ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
}

export async function generateMetadata({ params }: { params: Promise<{ claimId: string }> }): Promise<Metadata> {
  const { claimId } = await params;
  return {
    title: `Position ${shortId(claimId)}`,
    description: "Live capacity, financing and settlement history for a cashflow claim, read directly from the deployed Creditcoin registry.",
  };
}

export default function PositionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
