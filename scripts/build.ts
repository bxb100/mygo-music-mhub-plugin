import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "tsdown";
import { pluginFiles, readMetadata, root } from "./metadata.ts";

export async function buildPlugin() {
  const { manifest } = await readMetadata();
  const directory = resolve(root, "dist/plugin");
  await rm(directory, { recursive: true, force: true });
  await mkdir(resolve(directory, "locales"), { recursive: true });

  const { bundles } = await build({
    entry: { index: "src/index.ts" },
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

  const chunks = bundles.flatMap((b) => b.chunks).filter((c) => c.type === "chunk");
  if (chunks.length !== 1 || chunks[0].imports.length !== 0) {
    throw new Error("The plugin must be a single self-contained JavaScript module");
  }
  const expected: string[] = JSON.parse(await readFile(resolve(root, "tests/fixtures/exports.json"), "utf8"));
  if (JSON.stringify([...chunks[0].exports].sort()) !== JSON.stringify(expected)) {
    throw new Error("Plugin exports differ from the public API contract");
  }
  for (const file of pluginFiles) {
    if (file !== manifest.main) await copyFile(resolve(root, file), resolve(directory, file));
  }
  const inputs: Record<string, { imports: { path: string }[] }> = {};
  for (const id of Object.keys(chunks[0].modules || {})) {
    const rel = relative(root, id);
    inputs[rel] = { imports: [] };
  }
  const metafile = {
    outputs: {
      "dist/plugin/index.js": {
        imports: chunks[0].imports,
        exports: chunks[0].exports,
      },
    },
    inputs,
  };
  await writeFile(resolve(root, "dist/metafile.json"), JSON.stringify(metafile, null, 2) + "\n");
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildPlugin();
}
