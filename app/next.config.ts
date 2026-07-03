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
};

export default nextConfig;
