import { defineConfig, devices } from "@playwright/test";

const headless = process.env.HEADLESS === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3030",
    headless,
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "node tests/mock-moodle/server.js",
    url: "http://localhost:3030",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
