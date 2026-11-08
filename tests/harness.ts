import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type * as Plugin from "../src/index.js";
import type { Host } from "../src/types.js";

export const pluginDirectory = resolve(
  process.env.PLUGIN_DIR || fileURLToPath(new URL("../dist/plugin", import.meta.url)),
);

export interface Call {
  url: string;
  options?: RequestInit;
}

type MockResponse = unknown | Response;
type Handler = (call: Call) => MockResponse | Promise<MockResponse>;

interface HarnessOptions {
  storage?: Record<string, unknown>;
  settings?: Record<string, string>;
  handler?: Handler;
}

export async function harness({ storage = {}, settings = {}, handler = () => ({}) }: HarnessOptions = {}) {
  const store = new Map<string, unknown>(Object.entries(storage));
  const calls: Call[] = [];

  const host: Host = {
    storage: {
      get: (k: string) => structuredClone(store.get(k)),
      set: (k: string, v: unknown) => {
        store.set(k, structuredClone(v));
      },
      remove: (k: string) => {
        store.delete(k);
      },
    },
    setting: (k: string) => settings[k] || "",
    language: () => "zh-CN",
    t: (text: string) => text,
    webSignIn: async () => ({ cookie: "mhub_session=test-cookie" }),
  };

  const globalKey = `__mhub_test_${Math.random().toString(36).slice(2)}`;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals[globalKey] = host;

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call = { url: urlStr, options: init };
    calls.push(call);
    const result = await handler(call);
    if (result instanceof Response) return result;
    return Response.json(result);
  };
  globals[globalKey + "_fetch"] = mockFetch;

  const source = await readFile(resolve(pluginDirectory, "index.js"), "utf8");
  const prefix = `const host = globalThis.${globalKey}; const fetch = globalThis.${globalKey + "_fetch"};\n`;

  let plugin: typeof Plugin;
  try {
    plugin = (await import(
      `data:text/javascript;base64,${Buffer.from(prefix + source).toString("base64")}`
    )) as typeof Plugin;
  } finally {
    delete globals[globalKey];
    delete globals[globalKey + "_fetch"];
  }

  return { plugin, store, calls, host };
}
