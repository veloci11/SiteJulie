import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  output: "standalone",
  serverExternalPackages: ["playwright-core"],
  outputFileTracingIncludes: {
    "/api/museum/arrival": [
      "./node_modules/playwright-core/**/*",
      "./public/museum/arrival-empty*.webp",
      "./content/arrival/**/*",
    ],
    "/api/museum/arrival/status": [
      "./node_modules/playwright-core/**/*",
      "./content/arrival/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./ImageOeuvre/**/*",
      "./references/**/*",
      "./.local/**/*",
      "./assets/**/*",
      "./artifacts/**/*",
      "./docs/captures/**/*",
      ".env*",
    ],
  },
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/admin/arrival-capture",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default config;
