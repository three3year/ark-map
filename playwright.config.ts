import { defineConfig, devices } from "@playwright/test";

// Set SMOKE_PORT to run checkouts in parallel without sharing a port.
const port = Number(process.env.SMOKE_PORT) || 4173;
// GitHub Pages serves project sites under /<repo>/; preview the build under a sub-path
// so the smoke test catches absolute asset or data URLs.
const subPath = "/ark-map/";

export default defineConfig({
  testDir: "smoke",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: `http://localhost:${port}${subPath}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort --base ${subPath}`,
    url: `http://localhost:${port}${subPath}`,
    // Never reuse: a server already on this port belongs to some other build.
    reuseExistingServer: false,
  },
});
