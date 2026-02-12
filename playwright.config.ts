import { defineConfig, devices } from "@playwright/test"

const isCI = process.env.CI === "true" || process.env.CI === "1"

export default defineConfig({
  testDir: "./src/__tests__/browser",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: "list",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
    // Firefox and WebKit could be added but gRPC-web behavior is consistent
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] }
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] }
    // }
  ],
  webServer: {
    command: "bun run scripts/serve-test-bundle.ts",
    url: "http://localhost:5173",
    reuseExistingServer: !isCI,
    timeout: 10000
  }
})
