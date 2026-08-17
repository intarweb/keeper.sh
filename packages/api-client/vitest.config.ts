import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@keeper.sh/api-contracts": fileURLToPath(
        new URL("../api-contracts/src/index.ts", import.meta.url),
      ),
    },
  },
});
