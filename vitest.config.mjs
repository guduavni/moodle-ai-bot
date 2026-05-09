import { defineConfig } from "vitest/config";

// Default environment is node. Files that need jsdom opt in via a per-file
// directive: `// @vitest-environment jsdom` (see tests/unit/questionbot/*.test.js).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.{js,mjs}", "tests/integration/**/*.test.{js,mjs}"],
    exclude: ["tests/e2e/**", "tests/mock-moodle/**", "node_modules/**"],
    environment: "node"
  }
});
