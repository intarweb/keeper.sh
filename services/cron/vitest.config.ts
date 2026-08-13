import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(fileURLToPath(import.meta.url), "../src"),
    },
  },
  test: {
    globals: true,
    hookTimeout: 60_000,
    include: ["./tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
