import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/nav-bar";
import { SiteFooter } from "@/components/site-footer";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const SITE_URL = "https://notch-web-sooty.vercel.app";
const DESCRIPTION = "Notch decodes a real cashflow's financing capacity from a proven Ethereum transaction and enforces on-chain, on Creditcoin, that no combination of lenders can finance more than that capacity.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Notch", template: "%s · Notch" },
  description: DESCRIPTION,
  openGraph: {
    title: "Notch",
    description: DESCRIPTION,
    url: "/",
    siteName: "Notch",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Notch — cashflow-backed lending, conserved on-chain" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Notch",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-bone text-ink antialiased" suppressHydrationWarning>
        <Providers>
          <NavBar />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
