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

const themeInitScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("blinddrop:theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${specialElite.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Stamp data-theme before first paint to avoid a light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <Providers>
          <NavBar />
          <main className="flex flex-1 flex-col">{children}</main>
          <GuideWidget />
        </Providers>
      </body>
    </html>
  );
}
