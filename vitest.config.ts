import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        root: ".",
        plugins: [tsconfigPaths()],
        test: {
          name: "forge",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
});
