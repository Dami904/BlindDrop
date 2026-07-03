import type { Metadata } from "next";
import { Special_Elite, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";
import { GuideWidget } from "@/components/GuideWidget";

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  subsets: ["latin"],
  weight: "400",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "BlindDrop — Confidential Token Distribution",
  description:
    "Confidential airdrops on Zama FHEVM via TokenOps — amounts encrypted end-to-end, recipient list never published on-chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${specialElite.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <Providers>
          <NavBar />
          <main className="flex flex-1 flex-col">{children}</main>
          <GuideWidget />
        </Providers>
      </body>
    </html>
  );
}
