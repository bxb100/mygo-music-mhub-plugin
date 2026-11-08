import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [],
  },
  pack: {
    entry: {
      index: "src/index.ts",
    },
    format: "esm",
    target: "es2022",
    platform: "neutral",
    outDir: "dist/plugin",
    clean: false,
    dts: false,
    sourcemap: false,
    minify: false,
    deps: {
      alwaysBundle: [/.*/],
      onlyBundle: false,
    },
  },
});
