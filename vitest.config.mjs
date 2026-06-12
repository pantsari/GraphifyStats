import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.js"],
    coverage: {
      provider: "v8",
      include: ["extension.js", "lib/**/*.js"],
      reporter: ["text", "html"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 85,
      },
    },
  },
});
