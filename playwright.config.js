import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8000",
    headless: true,
    launchOptions: process.env.SYSTEM_CHROMIUM
      ? { executablePath: process.env.SYSTEM_CHROMIUM, args: ["--no-sandbox"] }
      : {},
  },
  webServer: {
    command: "python3 -m http.server 8000 --bind 127.0.0.1",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
