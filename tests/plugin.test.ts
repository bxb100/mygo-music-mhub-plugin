import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { harness, pluginDirectory } from "./harness.ts";

test("manifest declarations stay consistent with package metadata", async () => {
  const manifest = JSON.parse(await readFile(resolve(pluginDirectory, "plugin.json"), "utf8"));
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.id, "mhub");
  assert.equal(manifest.main, "index.js");
  assert.deepEqual(manifest.permissions.network, ["music.op.wiki", "music.zr.wiki", "music.apple.com"]);
  assert.equal(manifest.permissions.process, undefined);
});

test("web sign-in persists cookie, reads account and signOut clears session", async () => {
  const h = await harness({
    handler: ({ url }) => {
      if (url.includes("/api/v1/auth/me")) {
        return { user: { id: 42, username: "Alice" } };
      }
      if (url.includes("/api/v1/auth/logout")) {
        return { ok: true };
      }
      return {};
    },
  });

  assert.equal(await h.plugin.account(), null);
  const me = await h.plugin.signIn();
  assert.equal(me.id, "42");
  assert.equal(me.name, "Alice");
  assert.equal(h.store.get("cookie"), "mhub_session=test-cookie");

  await h.plugin.signOut();
  assert.equal(await h.plugin.account(), null);
  assert.equal(h.store.get("cookie"), undefined);
});

test("search queries endpoint with selected platform and formats track cards", async () => {
  const h = await harness({
    settings: { platform: "qq" },
    handler: ({ url }) => {
      if (url.includes("/api/v1/search")) {
        assert.ok(url.includes("platform=tencent"));
        assert.ok(url.includes("q=test"));
        return [
          {
            id: "1001",
            platform: "tencent",
            song: "Test Song",
            singer: "Test Artist",
            cover: "https://music.126.net/cover.jpg",
          },
        ];
      }
      return [];
    },
  });

  const res = await h.plugin.search({ query: "test", kind: "tracks" });
  assert.equal(res.more, false);
  assert.equal(res.tracks?.length, 1);
  assert.equal(res.tracks?.[0].id, "tencent:1001");
  assert.equal(res.tracks?.[0].name, "Test Song");
  assert.equal(res.tracks?.[0].artists[0].name, "Test Artist");
});

test("suggest returns unique suggestions", async () => {
  const h = await harness({
    handler: ({ url }) => {
      if (url.includes("/api/v1/search")) {
        return [
          { id: "1", platform: "applemusic", song: "Song A" },
          { id: "2", platform: "applemusic", song: "Song A" },
          { id: "3", platform: "applemusic", song: "Song B" },
        ];
      }
      return [];
    },
  });

  const suggestions = await h.plugin.suggest({ query: "Song" });
  assert.deepEqual(suggestions, ["Song A", "Song B"]);
});

test("recent and played track history recording", async () => {
  const h = await harness();
  assert.deepEqual(h.plugin.recent(), []);
  h.plugin.played({ id: "applemusic:123" });
  const recent = h.plugin.recent();
  assert.equal(recent.length, 1);
  assert.equal(recent[0].id, "applemusic:123");
});

test("stations returns default Endless Radio", async () => {
  const h = await harness();
  const list = h.plugin.stations();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "continue");
});

test("stream settling completes playback URL resolution", async () => {
  let polls = 0;
  const h = await harness({
    handler: ({ url, options }) => {
      if (url.includes("/api/v1/playbacks/task-1")) {
        polls++;
        return {
          id: "task-1",
          status: "completed",
          audio_url: "https://music.op.wiki/audio.mp3",
          byte_size: 1024,
          format: "mp3",
        };
      }
      if (url.includes("/api/v1/playbacks") && options?.method === "POST") {
        return {
          playback: { id: "task-1", status: "pending" },
          status_url: "/api/v1/playbacks/task-1",
        };
      }
      if (url.includes("audio.mp3")) {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "audio/mpeg", "content-length": "1024" },
        });
      }
      return {};
    },
  });

  const res = await h.plugin.stream({ id: "applemusic:999", quality: "high" });
  assert.equal(res.url, "https://music.op.wiki/audio.mp3");
  assert.equal(res.type, "mp3");
  assert.equal(res.size, 1024);
  assert.ok(polls >= 1);
});
