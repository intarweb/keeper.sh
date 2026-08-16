import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["./tests/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["./tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
});
