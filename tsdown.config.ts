import { defineConfig } from "tsdown";

export default defineConfig({
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
});
