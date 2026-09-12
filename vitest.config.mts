import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
  alias: {
    "@": path.resolve(import.meta.dirname, "src"),
    "server-only": path.resolve(
      import.meta.dirname,
      "src/test/server-only.ts",
    ),
  },
},
}); 