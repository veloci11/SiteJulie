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
    ],
    "/api/museum/arrival/status": ["./node_modules/playwright-core/**/*"],
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
    ];
  },
};
export default config;
