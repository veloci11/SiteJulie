import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.MUSEUM_QA_URL || "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      channel: "chrome",
      args:
        process.env.MUSEUM_QA_NATIVE_GPU === "1"
          ? []
          : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: process.env.MUSEUM_QA_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 120000,
      },
});
