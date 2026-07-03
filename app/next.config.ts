import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Zama FHE SDK's WASM uses wasm-bindgen-rayon threads (SharedArrayBuffer),
  // which browsers only enable on cross-origin-isolated pages.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  // Routes consolidated: /guide folded into "How it works" on the home page,
  // /faucet folded into "Get test tokens" on the home page, and /verify
  // folded into the "Verify your allocation" section of /claim.
  async redirects() {
    return [
      { source: "/guide", destination: "/", permanent: true },
      { source: "/faucet", destination: "/#faucet", permanent: true },
      {
        source: "/verify",
        has: [{ type: "query", key: "token", value: "(?<token>.*)" }],
        destination: "/claim?token=:token#verify",
        permanent: true,
      },
      { source: "/verify", destination: "/claim", permanent: true },
    ];
  },
};

export default nextConfig;
