// Start the actual standalone production build as a private local preview.
import { cp, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await access(".next/standalone/server.js");
await cp("public", ".next/standalone/public", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: process.env.MUSEUM_PREVIEW_PORT || "3000",
    ...(process.env.MUSEUM_DATA_MODE === "demo"
      ? {
          MUSEUM_LOCAL_DATA_DIR:
            process.env.MUSEUM_LOCAL_DATA_DIR || path.resolve(".local"),
        }
      : {}),
  },
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
