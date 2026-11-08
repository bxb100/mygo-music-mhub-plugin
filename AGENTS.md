# Repository Guidelines

## Project Structure & Module Organization

This repository provides the MHub plugin for MyGo Music.

- `src/` contains modular TypeScript modules for authentication, browsing, playback, and CRDT library synchronization; `src/index.ts` defines the public entry point.
- `plugin.json` declares plugin metadata and permissions; `locales/zh-CN.json` supplies Simplified Chinese translations.
- `scripts/` contains build, packaging, versioning, and release tooling.
- `tests/*.test.ts` covers plugin behavior, `tests/tooling/` covers distribution tooling, and `tests/fixtures/` stores export contracts.
- `dist/plugin/` and `dist/release/` contain generated installation files and archives. Do not edit generated output.

## Build, Test, and Development Commands

Use Node.js 22 from `.nvmrc` and Vite+ (`vp`) / pnpm pinned in `package.json`.

- `vp pack`: bundle the plugin library with Vite+ / tsdown.
- `pnpm install --frozen-lockfile`: install the locked dependencies.
- `pnpm build`: bundle the plugin into one standalone ES module and copy installation assets.
- `pnpm test`: build, then run plugin and tooling tests.
- `pnpm typecheck` and `pnpm lint`: check TypeScript and oxlint rules (`vp lint`).
- `pnpm format:check`: verify formatting with oxfmt (`vp fmt --check`); `pnpm format` applies it (`vp fmt`).
- `pnpm package`: produce the verified installation ZIP.
- `pnpm check`: run the complete validation and packaging pipeline used by CI.

For local testing, install `dist/plugin/` in MyGo Music; there is no standalone development server.

## Coding Style & Naming Conventions

Use two-space indentation, double quotes, semicolons. Prefer camelCase functions and variables, PascalCase types, and lowercase descriptive module filenames.

Keep runtime code host-compatible: `src/` must not import `node:*` or use `process`, `Buffer`, or `require`. Avoid circular source imports.

## Testing Guidelines

Tests use `node:test`, strict assertions, and `tsx`. Name tests `*.test.ts` and describe observable behavior. Reuse `tests/harness.ts` to mock host storage and network responses; plugin tests exercise the built bundle.

## Security & Configuration

Never commit session cookies or account data. Sessions are stored by the host. Preserve network permission boundaries and keep version metadata synchronized through `pnpm version:set <version>`.
