import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["./tests/**/*.test.ts"],
    testTimeout: 5000,
    hookTimeout: 5000,
    typecheck: {
      enabled: true,
      include: ["./tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
});
