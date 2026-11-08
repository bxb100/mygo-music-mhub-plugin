const BASE = "https://music.op.wiki";
const TASK_TIMEOUT = 90 * 1000;
const SEARCH_LIMIT = 20;
const RECENT_MAX = 100;
const RADIO_MAX = 300;
const SYNC_INTERVAL = 5000;
const APPLE_NEW_URL = "https://music.apple.com/cn/new";
const APPLE_NEW_TTL = 30 * 60 * 1000;
const AUDIO_TYPES = ["mp3", "flac", "ogg", "wav", "m4a", "aac"];
const QUALITIES = ["standard", "high", "lossless", "hires"];
const AVATAR = "https://music.op.wiki/icons/apple-touch-icon.png";

const ALIASES = {
  am: "applemusic",
  apple: "applemusic",
  "apple-music": "applemusic",
  apple_music: "applemusic",
  "苹果音乐": "applemusic",
  qq: "tencent",
  qqmusic: "tencent",
  tx: "tencent",
  "qq音乐": "tencent",
  "腾讯音乐": "tencent",
  "网易云": "netease",
  "网易云音乐": "netease",
  "b站": "bilibili",
  bili: "bilibili",
  yt: "youtubemusic",
  youtube: "youtubemusic",
  "ytmusic": "youtubemusic",
};

const PLATFORM_LABELS = {
  applemusic: "Apple Music",
  bilibili: "哔哩哔哩",
  kugou: "酷狗音乐",
  netease: "网易云音乐",
  soda: "汽水音乐",
  tencent: "QQ 音乐",
  youtubemusic: "YouTube Music",
};

const HOSTS = [
  ["music.apple.com", "applemusic"],
  ["music.163.com", "netease"],
  ["163cn.tv", "netease"],
  ["y.qq.com", "tencent"],
  ["qq.com", "tencent"],
  ["bilibili.com", "bilibili"],
  ["b23.tv", "bilibili"],
  ["music.youtube.com", "youtubemusic"],
  ["youtube.com", "youtubemusic"],
  ["kugou.com", "kugou"],
  ["qishui.douyin.com", "soda"],
];

const tr = (text) => host.t(text);
const meta = new Map();

let library = null;
let serverState = null;
let nextSync = 0;
let appleNewCache = null;
let appleNewAt = 0;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function setting(key) {
  const value = host.setting(key);
  return value == null ? "" : String(value).trim();
}

function platform() {
  const raw = setting("platform").toLowerCase();
  if (!raw) return "applemusic";
  return ALIASES[raw] || raw;
}

function level(wanted) {
  const value = String(wanted || "high").toLowerCase();
  return QUALITIES.indexOf(value) === -1 ? "high" : value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function absolute(url) {
  if (!url) return "";
  try {
    return new URL(url, BASE + "/").toString();
  } catch (error) {
    return String(url);
  }
}

function sized(url) {
  if (!url) return "";
  let text = String(url);
  if (text.indexOf("{w}x{h}") !== -1) {
    return text.replace(/\{w\}x\{h\}([^/]*)\.\{f\}/i, (match, crop) => {
      return "{size}x{size}" + crop.replace("{c}", "bb") + ".jpg";
    });
  }
  if (text.indexOf("music.126.net") !== -1) {
    if (!/[?&]param=/.test(text)) {
      text += (text.indexOf("?") === -1 ? "?" : "&") + "param={size}y{size}";
    }
    return text;
  }
  return text
    .replace(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)$/i, "/{size}x{size}bb.$1")
    .replace(/=w\d+-h\d+-l90-rj$/, "=w{size}-h{size}-l90-rj");
}

function queryOf(params) {
  const pairs = [];
  for (const key in params) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
  }
  return pairs.length ? "?" + pairs.join("&") : "";
}

function messageOf(body, response) {
  if (body && typeof body === "object" && body.detail) return body.detail;
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 300);
  return response.status + " " + response.statusText;
}

async function request(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw fail("unavailable", tr("Can't reach the music service.") + " " + error.message);
  }
  const type = response.headers.get("content-type") || "";
  const body = type.indexOf("json") !== -1 ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(messageOf(body, response));
    error.status = response.status;
    throw error;
  }
  return body;
}

function get(path, params) {
  return request(BASE + path + queryOf(params), { headers: { Accept: "application/json" } });
}

function post(path, body) {
  return request(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

function cookieHeader() {
  const value = host.storage.get("cookie");
  return typeof value === "string" ? value : "";
}

function authHeaders(extra) {
  const cookie = cookieHeader();
  return {
    Accept: "application/json",
    "x-mhub-client": "1",
    Cookie: cookie,
    ...(extra || {}),
  };
}

async function authRequest(path, init) {
  if (!cookieHeader()) throw fail("signIn", tr("Sign in to MHub to sync playlists."));
  try {
    return await request(BASE + path, { ...(init || {}), headers: authHeaders(init && init.headers) });
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      throw fail("signIn", tr("Your MHub session expired. Sign in again."));
    }
    throw error;
  }
}

function currentAccount() {
  const me = host.storage.get("account");
  return me && me.id ? me : null;
}

function requireAccount() {
  const me = currentAccount();
  if (!me) throw fail("signIn", tr("Sign in to MHub to sync playlists."));
  return me;
}

function clearSession() {
  host.storage.remove("cookie");
  host.storage.remove("account");
  library = null;
  serverState = null;
  nextSync = 0;
}

export async function signIn() {
  const result = await host.webSignIn({
    url: BASE + "/",
    cookiesOf: BASE + "/",
    until: ["mhub_session"],
  });
  host.storage.set("cookie", result.cookie);
  const me = await account();
  if (!me) {
    clearSession();
    throw new Error(tr("MHub didn't accept that sign-in. Try again."));
  }
  return me;
}

export async function signOut() {
  if (cookieHeader()) {
    try {
      await authRequest("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch (error) {
      console.warn("MHub sign out: " + error.message);
    }
  }
  clearSession();
}

export async function account() {
  if (!cookieHeader()) return null;
  let data;
  try {
    data = await authRequest("/api/v1/auth/me");
  } catch (error) {
    if (error.code === "signIn") return null;
    throw error;
  }
  if (!data.user) {
    clearSession();
    return null;
  }
  const me = {
    id: String(data.user.id),
    name: String(data.user.username || ""),
    imageUrl: AVATAR,
  };
  host.storage.set("account", me);
  return me;
}

function toBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  }
  return btoa(text);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function ensureLibrary() {
  const me = requireAccount();
  if (library && library.accountId === me.id) return library.doc;
  const doc = new MHubLibrary.Doc();
  const saved = host.storage.get("library:" + me.id);
  if (saved && saved.update) MHubLibrary.applyUpdate(doc, fromBase64(saved.update));
  serverState = saved && saved.serverSV ? fromBase64(saved.serverSV) : null;
  library = { accountId: me.id, doc };
  return doc;
}

function persistLibrary() {
  if (!library) return;
  host.storage.set("library:" + library.accountId, {
    update: toBase64(MHubLibrary.encodeStateAsUpdate(library.doc)),
    serverSV: serverState ? toBase64(serverState) : "",
  });
}

async function syncLibrary(force) {
  const doc = ensureLibrary();
  if (!force && Date.now() < nextSync) return doc;
  const state = MHubLibrary.encodeStateVector(doc);
  const update = MHubLibrary.encodeStateAsUpdate(doc, serverState || undefined);
  const data = await authRequest("/api/v1/sync/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state_vector: toBase64(state), update: toBase64(update) }),
  });
  if (data.update) MHubLibrary.applyUpdate(doc, fromBase64(data.update));
  serverState = data.state_vector ? fromBase64(data.state_vector) : null;
  nextSync = Date.now() + SYNC_INTERVAL;
  persistLibrary();
  return doc;
}

function playlistCard(item, owner) {
  const cover = item.cover || (item.tracks[0] && item.tracks[0].cover) || "";
  return {
    id: item.id,
    name: item.name,
    imageUrl: sized(cover),
    description: "",
    owner,
    trackCount: item.tracks.length,
    mine: true,
    saved: false,
  };
}

function libraryTrack(id) {
  const ref = unpack(id);
  const info = meta.get(id) || {};
  return {
    platform: ref.platform,
    source_id: ref.trackId,
    song: info.title || ref.trackId,
    singer: info.artist || "",
    cover: info.cover || "",
  };
}

function libraryTracks(item) {
  return item.tracks.map((track) =>
    trackOf({
      platform: track.platform,
      id: track.source_id,
      song: track.title,
      singer: track.artist,
      cover: track.cover,
    })
  );
}

export async function playlists() {
  const me = requireAccount();
  const doc = await syncLibrary(false);
  return MHubLibrary.readLibrary(doc).playlists.map((item) => playlistCard(item, me.name));
}

export async function playlist({ id }) {
  const target = String(id || "");
  if (target.indexOf("pl:") === 0) {
    const data = await resolveCollection(target.slice(3));
    const tracks = tracksOf(data);
    return {
      id: target,
      name: data.title,
      imageUrl: coverOf(tracks),
      description: "",
      owner: "Apple Music",
      trackCount: tracks.length,
      tracks,
    };
  }
  const me = requireAccount();
  const doc = await syncLibrary(false);
  const item = MHubLibrary.readLibrary(doc).playlists.find((entry) => entry.id === target);
  if (!item) throw fail("unavailable", tr("That playlist is gone."));
  return { ...playlistCard(item, me.name), tracks: libraryTracks(item) };
}

export async function createPlaylist({ name }) {
  const me = requireAccount();
  const doc = await syncLibrary(false);
  const id = "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  MHubLibrary.createPlaylist(doc, { id, name, tracks: [] });
  await syncLibrary(true);
  const item = MHubLibrary.readLibrary(doc).playlists.find((entry) => entry.id === id);
  return playlistCard(item, me.name);
}

export async function renamePlaylist({ id, name }) {
  const doc = await syncLibrary(false);
  MHubLibrary.renamePlaylist(doc, id, name);
  await syncLibrary(true);
}

export async function deletePlaylist({ id }) {
  const doc = await syncLibrary(false);
  MHubLibrary.deletePlaylist(doc, id);
  await syncLibrary(true);
}

export async function addToPlaylist({ id, trackIds }) {
  const doc = await syncLibrary(false);
  MHubLibrary.appendTracks(doc, id, trackIds.map(libraryTrack));
  await syncLibrary(true);
}

export async function removeFromPlaylist({ id, trackIds }) {
  const doc = await syncLibrary(false);
  for (const trackId of trackIds) MHubLibrary.removeTrack(doc, id, trackId);
  await syncLibrary(true);
}

export async function movePlaylistTrack({ id, from, to }) {
  const doc = await syncLibrary(false);
  MHubLibrary.moveTrack(doc, id, from, to);
  await syncLibrary(true);
}

function platformOf(url) {
  const text = String(url || "");
  for (const pair of HOSTS) {
    if (text.indexOf(pair[0]) !== -1) return pair[1];
  }
  return platform();
}

function artistsOf(name) {
  const text = String(name || "").trim();
  return text ? [{ id: "artist:" + text, name: text }] : [];
}

function unpack(id) {
  const text = String(id == null ? "" : id);
  const at = text.indexOf(":");
  if (at === -1) return { platform: platform(), trackId: text };
  return { platform: text.slice(0, at), trackId: text.slice(at + 1) };
}

function trackOf(item, extra) {
  const album = (extra && extra.album) || "";
  const cover = sized(item.cover || (extra && extra.cover) || "");
  const id = item.platform + ":" + item.id;
  const track = {
    id,
    name: item.song || item.title || item.id,
    artists: artistsOf(item.singer || (extra && extra.artist)),
  };
  if (album || cover) {
    track.album = {
      id: album && extra.albumUrl ? "al:" + extra.albumUrl : "",
      name: album,
      imageUrl: cover,
    };
  }
  if (extra && extra.duration) track.duration = Math.round(extra.duration * 1000);
  meta.set(id, {
    platform: item.platform,
    trackId: item.id,
    title: track.name,
    artist: track.artists.length ? track.artists[0].name : "",
    album,
    duration: (extra && extra.duration) || 0,
    cover,
  });
  return track;
}

function trackFromMeta(id, info) {
  const track = { id, name: info.title || id, artists: artistsOf(info.artist) };
  if (info.album || info.cover) {
    track.album = { id: "", name: info.album || "", imageUrl: info.cover || "" };
  }
  if (info.duration) track.duration = Math.round(info.duration * 1000);
  return track;
}

function shelfPlaylist(item, fixed) {
  return {
    id: "pl:" + (item.url || item.id),
    name: item.name,
    imageUrl: fixed ? item.cover || "" : sized(item.cover || ""),
    description: item.description || "",
    owner: item.curator || "",
    trackCount: 0,
  };
}

function shelfAlbum(item, fixed) {
  return {
    id: "al:" + (item.url || item.id),
    name: item.name || "",
    imageUrl: fixed ? item.cover || "" : sized(item.cover || ""),
    artists: artistsOf(item.curator),
  };
}

async function resolveCollection(url) {
  return get("/api/v1/collections/resolve", { platform: platformOf(url), url });
}

function tracksOf(data, albumUrl) {
  return (data.items || []).map((item) =>
    trackOf(item, albumUrl ? { album: data.title, albumUrl } : undefined)
  );
}

function coverOf(tracks) {
  for (const track of tracks) {
    if (track.album && track.album.imageUrl) return track.album.imageUrl;
  }
  return "";
}

function recentTracks() {
  const value = host.storage.get("recent");
  return Array.isArray(value) ? value : [];
}

function typeOf(task, url) {
  const format = String(task.format || "").toLowerCase();
  if (format === "alac" || format === "mp4") return "m4a";
  if (AUDIO_TYPES.indexOf(format) !== -1) return format;
  const fromContentType = contentTypeOf(task.content_type);
  if (fromContentType) return fromContentType;
  const suffix = String(url || "").split("?")[0].split(".").pop().toLowerCase();
  if (suffix === "alac") return "m4a";
  return AUDIO_TYPES.indexOf(suffix) === -1 ? "mp3" : suffix;
}

function contentTypeOf(value) {
  const text = String(value || "").toLowerCase();
  if (text.indexOf("mpeg") !== -1) return "mp3";
  if (text.indexOf("mp4") !== -1 || text.indexOf("m4a") !== -1) return "m4a";
  if (text.indexOf("flac") !== -1) return "flac";
  if (text.indexOf("ogg") !== -1) return "ogg";
  if (text.indexOf("wav") !== -1) return "wav";
  if (text.indexOf("aac") !== -1) return "aac";
  return "";
}

async function probe(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length"));
    return {
      type: contentTypeOf(response.headers.get("content-type")),
      size: Number.isFinite(length) ? length : 0,
    };
  } catch (error) {
    console.warn("MHub probe: " + error.message);
    return null;
  }
}

async function settle(task, statusUrl) {
  if (task.status === "completed") return task;
  if (task.status === "failed") {
    throw fail("unavailable", task.error || tr("The service could not prepare this song."));
  }
  const url = absolute(statusUrl || "/api/v1/playbacks/" + task.id);
  const deadline = Date.now() + TASK_TIMEOUT;
  let delay = 800;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.4), 3000);
    const current = await request(url, { headers: { Accept: "application/json" } });
    if (current.status === "completed") return current;
    if (current.status === "failed") {
      throw fail("unavailable", current.error || tr("The service could not prepare this song."));
    }
  }
  throw fail("unavailable", tr("The service took too long to prepare this song."));
}

function rememberTask(id, ref, task) {
  const previous = meta.get(id) || {};
  meta.set(id, {
    platform: ref.platform,
    trackId: ref.trackId,
    title: task.title || previous.title || "",
    artist: task.artist || previous.artist || "",
    album: task.album || previous.album || "",
    duration: task.duration || previous.duration || 0,
    cover: previous.cover || "",
  });
}

function appleSection(section, title) {
  if (!section) return null;
  const playlists = [];
  const albums = [];
  for (const item of section.items || []) {
    const descriptor = item.contentDescriptor || {};
    const link = (item.titleLinks && item.titleLinks[0]) || {};
    const name = link.title || item.title || "";
    const url = descriptor.url || "";
    const cover = (((item.artwork || {}).dictionary || {}).url || "").replace(
      /\{w\}x\{h\}([^/]*)\.\{f\}/i,
      (match, crop) => "1080x1080" + crop.replace("{c}", "bb") + ".jpg"
    );
    if (!name || !url) continue;
    if (descriptor.kind === "playlist") {
      playlists.push(shelfPlaylist({ name, url, cover, curator: "Apple Music" }, true));
    } else if (descriptor.kind === "album") {
      albums.push(shelfAlbum({ name, url, cover, curator: "Apple Music" }, true));
    }
  }
  if (!playlists.length && !albums.length) return null;
  return { title, playlists, albums };
}

async function appleNewSections() {
  if (appleNewCache && Date.now() - appleNewAt < APPLE_NEW_TTL) return appleNewCache;
  const response = await fetch(APPLE_NEW_URL, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error("Apple Music " + response.status + " " + response.statusText);
  const html = await response.text();
  const match = html.match(
    /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error("Apple Music page changed.");
  const data = JSON.parse(match[1]);
  const root = (data.data || [])[0] || {};
  const sections = (root.data || {}).sections || [];
  const find = (id) => sections.find((section) => String(section.id || "").indexOf(id) !== -1);
  appleNewCache = [
    appleSection(find("6831386381"), tr("Everyone's Listening")),
    appleSection(find("6505052377"), tr("Weekly Top 100")),
    appleSection(find("6504784714"), tr("City Charts")),
  ].filter(Boolean);
  appleNewAt = Date.now();
  return appleNewCache;
}

async function discover() {
  try {
    return { title: tr("Discover"), sections: await appleNewSections() };
  } catch (error) {
    console.warn("Apple Music new: " + error.message);
    return { title: tr("Discover"), sections: [] };
  }
}

async function collectionPage(url, isAlbum) {
  const data = await resolveCollection(url);
  const tracks = tracksOf(data, isAlbum ? url : "");
  return { title: data.title, sections: tracks.length ? [{ tracks }] : [] };
}

export async function home() {
  const data = await get("/api/v1/recommendations/home", { limit: 12 });
  const sections = [];
  const recent = recentTracks();
  if (recent.length) sections.push({ title: tr("Recently played"), tracks: recent.slice(0, 10) });
  const resources = new Map((data.playlists || []).map((item) => [String(item.id), item]));
  for (const tag of data.tags || []) {
    const items = (tag.playlist_ids || []).map((id) => resources.get(String(id))).filter(Boolean);
    const playlists = items
      .filter((item) => item.resource_type !== "albums")
      .map((item) => shelfPlaylist(item));
    const albums = items
      .filter((item) => item.resource_type === "albums")
      .map((item) => shelfAlbum(item));
    if (!playlists.length && !albums.length) continue;
    const section = { title: tag.label };
    if (playlists.length) section.playlists = playlists;
    if (albums.length) section.albums = albums;
    sections.push(section);
  }
  const tracks = (data.tracks || []).map((item) => trackOf(item));
  if (tracks.length) sections.push({ title: tr("Recommended songs"), tracks });
  return { title: "MHub", sections };
}

export async function browse({ page }) {
  const target = String(page || "");
  if (target === "discover") return discover();
  if (target === "library") {
    const lists = await playlists();
    return { title: tr("Library"), sections: lists.length ? [{ playlists: lists }] : [] };
  }
  if (target.indexOf("pl:") === 0) return collectionPage(target.slice(3), false);
  if (target.indexOf("al:") === 0) return collectionPage(target.slice(3), true);
  throw fail("unavailable", tr("No such page."));
}

export async function search({ query, kind, offset }) {
  const text = String(query || "").trim();
  if (!text || (kind && kind !== "tracks") || Number(offset || 0) > 0) return { more: false };
  const items = await get("/api/v1/search", {
    platform: platform(),
    q: text,
    limit: SEARCH_LIMIT,
  });
  return { tracks: items.map((item) => trackOf(item)), more: false };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const items = await get("/api/v1/search", { platform: platform(), q: text, limit: 6 });
    return items.map((item) => item.song).filter((name, index, names) => name && names.indexOf(name) === index);
  } catch (error) {
    console.warn("MHub suggest: " + error.message);
    return [];
  }
}

export function recent() {
  return recentTracks();
}

export function played({ id }) {
  const info = meta.get(id);
  const previous = recentTracks().find((item) => item.id === id);
  const track = info ? trackFromMeta(id, info) : previous || { id, name: id, artists: [] };
  const recent = recentTracks().filter((item) => item.id !== id);
  host.storage.set("recent", [track, ...recent].slice(0, RECENT_MAX));
  const radio = host.storage.get("radio");
  const seen = Array.isArray(radio) ? radio.filter((item) => item !== id) : [];
  host.storage.set("radio", [id, ...seen].slice(0, RADIO_MAX));
}

export async function album({ id }) {
  const target = String(id || "");
  const url = target.indexOf("al:") === 0 ? target.slice(3) : target;
  const data = await resolveCollection(url);
  const tracks = tracksOf(data, url);
  return {
    album: {
      id: "al:" + url,
      name: data.title,
      imageUrl: coverOf(tracks),
    },
    tracks,
  };
}

export async function lyrics({ id }) {
  const ref = unpack(id);
  const info = meta.get(id) || {};
  const data = await get("/api/v1/lyrics", {
    platform: ref.platform,
    track_id: ref.trackId,
    title: info.title,
    artist: info.artist,
    album: info.album,
    duration: info.duration ? Math.round(info.duration) : undefined,
  });
  if (!data.available || !data.plain) {
    throw fail("unavailable", tr("No lyrics for this song."));
  }
  const out = { lrc: data.plain };
  if (data.translation) out.translation = data.translation;
  return out;
}

export async function stream({ id, quality }) {
  const ref = unpack(id);
  const wanted = level(quality);
  const created = await post("/api/v1/playbacks", {
    platform: ref.platform,
    query: ref.trackId,
    selected_id: ref.trackId,
    quality: wanted,
    include_cover: true,
  });
  const task = await settle(created.playback, created.status_url);
  const url = absolute(task.audio_url || created.audio_url);
  if (!url) throw fail("unavailable", tr("The service did not return an audio file."));
  rememberTask(id, ref, task);
  const actual = await probe(url);
  const out = {
    url,
    type: (actual && actual.type) || typeOf(task, url),
    quality: wanted,
  };
  const size = (actual && actual.size) || task.byte_size;
  if (size) out.size = size;
  return out;
}

export function stations() {
  const last = recentTracks()[0];
  const station = {
    id: "continue",
    name: tr("Endless Radio"),
    description: tr("New songs from your last played track"),
  };
  if (last && last.album && last.album.imageUrl) station.imageUrl = last.album.imageUrl;
  return [station];
}

export async function stationNext() {
  const radio = host.storage.get("radio");
  const history = Array.isArray(radio) ? radio : [];
  const seeds = history
    .map((item) => unpack(item))
    .filter((ref) => ref.platform === "applemusic" && /^\d+$/.test(ref.trackId))
    .map((ref) => ref.trackId);
  if (!seeds.length) {
    const pool = await get("/api/v1/recommendations", { platform: "applemusic", limit: 1 });
    if (pool.length && /^\d+$/.test(pool[0].id)) seeds.push(pool[0].id);
  }
  if (!seeds.length) return [];
  try {
    const data = await post("/api/v1/recommendations/continue", {
      platform: "applemusic",
      seed_id: seeds[0],
      exclude: seeds.slice(0, 1000),
      limit: 20,
    });
    if (data.tracks.length) return data.tracks.map((item) => trackOf(item));
  } catch (error) {
    console.warn("MHub radio: " + error.message);
  }
  const fallback = await get("/api/v1/recommendations", { platform: "applemusic", limit: 20 });
  return fallback.map((item) => trackOf(item));
}
