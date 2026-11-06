import { defineConfig, devices } from "@playwright/test";

// GitHub Pages serves project sites under /<repo>/; preview the build under a sub-path
// so the smoke test catches absolute asset or data URLs.
const port = 4173;
const subPath = "/ak-snapshot-viewer/";

export default defineConfig({
  testDir: "smoke",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: `http://localhost:${port}${subPath}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort --base ${subPath}`,
    url: `http://localhost:${port}${subPath}`,
    reuseExistingServer: !process.env.CI,
  },
});
