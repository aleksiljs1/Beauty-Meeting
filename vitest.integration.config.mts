import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests talk to the local Docker services (Postgres, SeaweedFS, Mailpit) and use a
// separate database (academy_test) so they never touch development data.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["src/test/integration-setup.ts"],
    env: { DATABASE_URL: "postgresql://academy:academy_dev_password@localhost:5433/academy_test" },
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
