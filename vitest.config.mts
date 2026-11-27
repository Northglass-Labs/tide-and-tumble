import { cloudflareTest } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Three projects, one command (`npm test`):
//   app     - the Next.js app's libraries, components and content contracts, in Node
//             (a file asks for jsdom with a `@vitest-environment jsdom` comment)
//   worker  - the API Worker, run inside the Workers runtime with its real
//             wrangler.jsonc; upstream calls are stubbed in each test
//   scripts - the delivery commands' logic and the workflows, in Node
export default defineConfig({
  test: {
    projects: [
      {
        extends: false,
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "app",
          environment: "node",
          include: ["test/app/**/*.test.{ts,tsx}"],
          restoreMocks: true,
        },
      },
      {
        extends: false,
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              // A fixed address so tests never depend on the production one.
              bindings: { APP_ORIGIN: "https://tide.test" },
              // The static files are not built for tests; any non-API request
              // the Worker hands to them gets this directory's 404.
              assets: { directory: "./test/worker/assets" },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["test/worker/**/*.test.ts"],
          restoreMocks: true,
        },
      },
      {
        extends: false,
        test: {
          name: "scripts",
          environment: "node",
          include: ["test/scripts/**/*.test.ts"],
        },
      },
    ],
  },
});
