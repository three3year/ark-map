import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works under a GitHub Pages sub-path.
  base: "./",
  plugins: [svelte()],
  test: {
    include: ["src/**/*.test.ts", "pipeline/**/*.test.ts"],
  },
});
