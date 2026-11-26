import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      // The client's types come from @kaneo/api source, which imports the
      // built workspace packages.
      "check:types": {
        command: "tsc --noEmit -p tsconfig.json",
        dependsOn: [
          { task: "build", from: ["dependencies", "devDependencies"] },
        ],
        cache: false,
      },
      "test:run": {
        command: "vp test run --config vitest.config.ts",
        cache: false,
      },
    },
  },
});
