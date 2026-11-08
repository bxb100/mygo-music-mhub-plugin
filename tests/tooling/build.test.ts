import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { unzipSync, zipSync } from "fflate";
import { parseAllDocuments, parse } from "yaml";
import { archivePlugin, sha256, verifyArchive } from "../../scripts/package.ts";
import { pluginFiles, readMetadata, root, validateMetadata, validateVersion } from "../../scripts/metadata.ts";
import { setVersion } from "../../scripts/version.ts";

test("bundle is standalone, preserves exports, metadata, locales and permissions", async () => {
  const { manifest } = await readMetadata();
  const meta = JSON.parse(await readFile(resolve(root, "dist/metafile.json"), "utf8")) as {
    outputs: Record<string, { imports: unknown[]; exports: string[] }>;
    inputs: Record<string, { imports: { path: string }[] }>;
  };
  const outputs = Object.values(meta.outputs);
  assert.equal(outputs.length, 1);
  assert.deepEqual(outputs[0].imports, []);
  const expected: string[] = JSON.parse(await readFile(resolve(root, "tests/fixtures/exports.json"), "utf8"));
  assert.deepEqual(outputs[0].exports.toSorted(), expected);
  assert.ok(
    Object.keys(meta.inputs).some((file) => file.startsWith("src/")),
    "Inputs should contain source files",
  );
  for (const name of ["plugin.json", "locales/zh-CN.json"]) {
    assert.deepEqual(await readFile(resolve(root, "dist/plugin", name)), await readFile(resolve(root, name)));
  }
  assert.deepEqual(manifest.permissions.network, ["music.op.wiki", "music.zr.wiki", "music.apple.com"]);
  assert.equal(manifest.permissions.process, undefined);
});

test("ZIP is deterministic, root-level and limited to installation files", async () => {
  const { manifest } = await readMetadata();
  const first = await archivePlugin(resolve(root, "dist/plugin"));
  const second = await archivePlugin(resolve(root, "dist/plugin"));
  assert.equal(sha256(first), sha256(second));
  const files = verifyArchive(first, manifest);
  assert.deepEqual(Object.keys(files).sort(), [...pluginFiles].sort());
  assert.throws(() => verifyArchive(first, { ...manifest, version: "different" }), /manifest/);
  const bad = unzipSync(first);
  bad["src/source.ts"] = Buffer.from("not a runtime file");
  assert.throws(() => verifyArchive(zipSync(bad), manifest), /Unexpected/);
});

test("version validation follows metadata rather than a hardcoded release", async () => {
  const { pkg, manifest } = await readMetadata();
  validateMetadata(pkg, manifest);
  for (const invalid of ["", "v1.2.3", "01.2.3", "1.2", "1.2.3-beta", "1.2.3\n"]) {
    assert.throws(() => validateVersion(invalid));
  }
  assert.throws(() => validateMetadata(pkg, { ...manifest, version: "different" }), /must match/);
  assert.throws(() => validateMetadata(pkg, { ...manifest, minAppVersion: "invalid" }));
});

test("version command updates both manifests without changing the dependency lock", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "mygo-version-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { pkg, manifest } = await readMetadata();
  const version = `${BigInt(pkg.version.split(".")[0]) + 1n}.0.0`;
  await writeFile(resolve(directory, "package.json"), JSON.stringify(pkg));
  await writeFile(resolve(directory, "plugin.json"), JSON.stringify(manifest));
  await writeFile(resolve(directory, "pnpm-lock.yaml"), "untouched lock fixture\n");
  await setVersion(version, directory);
  const updated = await readMetadata(directory);
  assert.equal(updated.pkg.version, version);
  assert.equal(updated.manifest.version, version);
  for (const name of ["package.json", "plugin.json"]) {
    const content = await readFile(resolve(directory, name), "utf8");
    assert.equal(content, JSON.stringify(JSON.parse(content), null, 2) + "\n");
  }
  assert.equal(await readFile(resolve(directory, "pnpm-lock.yaml"), "utf8"), "untouched lock fixture\n");
  await assert.rejects(setVersion(version, directory), /increase/);
  await assert.rejects(setVersion(pkg.version, directory), /increase/);
  await assert.rejects(setVersion("bad", directory));
});

test("pnpm pins every development dependency and is the sole package manager", async () => {
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
    packageManager: string;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  assert.match(pkg.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  const documents = parseAllDocuments(await readFile(resolve(root, "pnpm-lock.yaml"), "utf8"));
  const importers = documents.map(
    (document) =>
      document.toJS() as {
        importers?: { ".": { devDependencies?: Record<string, { specifier: string }> } };
      },
  );
  const locked = importers.find((doc) => doc.importers?.["."].devDependencies)?.importers?.["."].devDependencies;
  assert.ok(locked);
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.equal(locked[name]?.specifier, version, name);
    assert.match(version, /^\d+\.\d+\.\d+$/);
  }
  await assert.rejects(readFile(resolve(root, "package-lock.json")), { code: "ENOENT" });
  assert.ok(Object.values(pkg.scripts).every((command) => !/\b(?:npm|npx)\b/.test(command)));
});

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency?: { "cancel-in-progress": boolean };
  jobs: Record<
    string,
    {
      if?: string;
      needs?: string;
      permissions?: Record<string, string>;
      steps: { uses?: string; run?: string; with?: Record<string, unknown> }[];
    }
  >;
}

test("workflows are pinned, use pnpm and only the release job can write", async () => {
  const ci = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
  const release = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
  assert.deepEqual(Object.keys(release.on).sort(), ["push", "workflow_dispatch"]);
  assert.equal(ci.permissions.contents, "read");
  assert.equal(release.permissions.contents, "read");
  assert.equal(release.jobs.build.if, "github.ref == 'refs/heads/main'");
  assert.equal(release.jobs.release.needs, "build");
  assert.equal(release.jobs.release.permissions?.contents, "write");
  assert.equal(release.concurrency?.["cancel-in-progress"], false);
  assert.ok(!ci.jobs.check.permissions && !release.jobs.build.permissions);
  for (const workflow of [ci, release]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (step.uses) assert.match(step.uses, /^[\w/-]+@[a-f0-9]{40}$/);
        if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with?.["persist-credentials"], false);
        assert.ok(!/\b(?:npm|npx)\b/.test(step.run || ""));
      }
    }
  }
  assert.ok(release.jobs.build.steps.some((step) => step.run === "pnpm install --frozen-lockfile"));
  assert.ok(release.jobs.release.steps.every((step) => !step.run?.includes("install")));
  const commands = release.jobs.release.steps.map((step) => step.run || "").join("\n");
  assert.match(commands, /sha256sum --check/);
  assert.match(commands, /git rev-parse --verify/);
  assert.match(commands, /gh release create "\$RELEASE_TAG"/);
  assert.match(commands, /--generate-notes --target "\$RELEASE_COMMIT"/);
  assert.doesNotMatch(commands, /--draft/);
  assert.doesNotMatch(commands, /scripts\/release|gh release (?:edit|delete|upload)/);
});
