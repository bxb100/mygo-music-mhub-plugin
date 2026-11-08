import * as Y from "yjs";

const unnamed = "未命名歌单";

function trackKey(track) {
  const platform = String(track.platform || "").trim().toLowerCase();
  const id =
    track.source_id ||
    track.selected_id ||
    track.track_id ||
    (typeof track.id === "string" && track.id.includes("--")
      ? track.id.split("--").slice(0, -1).join("--")
      : track.id) ||
    "";
  return platform && id ? platform + ":" + id : "";
}

function trackMeta(track) {
  return {
    platform: track.platform || "",
    source_id: String(track.source_id || track.selected_id || track.track_id || track.id || ""),
    title: track.title || track.song || "",
    artist: track.artist || track.singer || "",
    cover: track.cover || track.cover_url || "",
  };
}

function putTracks(trackMap, tracks) {
  const keys = [];
  for (const track of tracks || []) {
    const key = trackKey(track);
    if (!key) continue;
    const meta = trackMeta(track);
    const previous = trackMap.get(key);
    if (!previous || previous.title !== meta.title || previous.cover !== meta.cover) {
      trackMap.set(key, meta);
    }
    if (keys.indexOf(key) === -1) keys.push(key);
  }
  return keys;
}

export function readLibrary(doc) {
  const playlists = doc.getMap("playlists");
  const tracks = doc.getMap("tracks");
  const taste = doc.getMap("taste");
  const result = [];
  playlists.forEach((item, id) => {
    if (!(item instanceof Y.Map)) return;
    const order = item.get("order");
    const keys = order instanceof Y.Array ? order.toArray() : [];
    const seen = new Set();
    const list = [];
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const track = tracks.get(key);
      if (track) list.push({ ...track, key });
    }
    result.push({
      id,
      name: item.get("name") || unnamed,
      platform: item.get("platform") || "",
      source_id: item.get("source_id") || "",
      source_url: item.get("source_url") || "",
      source_platform: item.get("source_platform") || "",
      source_keys: Array.isArray(item.get("source_keys")) ? item.get("source_keys") : null,
      synced_at: item.get("synced_at") || 0,
      cover: item.get("cover") || (list[0] && list[0].cover) || "",
      created_at: item.get("created_at") || 0,
      updated_at: item.get("updated_at") || 0,
      tracks: list,
    });
  });
  result.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));
  const tasteKeys = (name) => {
    const value = taste.get(name);
    return value instanceof Y.Array ? [...new Set(value.toArray())] : [];
  };
  return { playlists: result, liked: tasteKeys("liked"), less: tasteKeys("less") };
}

export function createPlaylist(
  doc,
  {
    id,
    name,
    platform = "",
    sourceId = "",
    sourceUrl = "",
    sourcePlatform = "",
    sourceKeys = null,
    cover = "",
    tracks = [],
    now = Date.now(),
  }
) {
  doc.transact(() => {
    const playlists = doc.getMap("playlists");
    const trackMap = doc.getMap("tracks");
    const keys = putTracks(trackMap, tracks);
    const item = new Y.Map();
    item.set("name", String(name || unnamed).trim() || unnamed);
    item.set("platform", platform);
    item.set("source_id", sourceId);
    item.set("source_url", sourceUrl);
    if (sourcePlatform) item.set("source_platform", sourcePlatform);
    if (Array.isArray(sourceKeys)) {
      item.set("source_keys", sourceKeys);
      item.set("synced_at", now);
    }
    item.set("cover", cover || (tracks[0] && tracks[0].cover) || "");
    item.set("created_at", now);
    item.set("updated_at", now);
    const order = new Y.Array();
    order.push(keys);
    item.set("order", order);
    playlists.set(id, item);
  });
}

export function appendTracks(doc, id, tracks, now = Date.now()) {
  let added = 0;
  doc.transact(() => {
    const item = doc.getMap("playlists").get(id);
    const order = item && item.get("order");
    if (!(order instanceof Y.Array)) return;
    const have = new Set(order.toArray());
    const keys = putTracks(doc.getMap("tracks"), tracks).filter((key) => !have.has(key) && have.add(key));
    if (!keys.length) return;
    order.push(keys);
    if (!item.get("cover")) item.set("cover", (tracks[0] && tracks[0].cover) || "");
    item.set("updated_at", now);
    added = keys.length;
  });
  return added;
}

export function removeTrack(doc, id, key, now = Date.now()) {
  doc.transact(() => {
    const item = doc.getMap("playlists").get(id);
    const order = item && item.get("order");
    if (!(order instanceof Y.Array)) return;
    const keys = order.toArray();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i] === key) order.delete(i, 1);
    }
    item.set("updated_at", now);
  });
}

export function renamePlaylist(doc, id, name, now = Date.now()) {
  doc.transact(() => {
    const item = doc.getMap("playlists").get(id);
    if (!item) return;
    item.set("name", String(name || unnamed).trim() || unnamed);
    item.set("updated_at", now);
  });
}

export function deletePlaylist(doc, id) {
  doc.transact(() => doc.getMap("playlists").delete(id));
}

export function moveTrack(doc, id, from, to, now = Date.now()) {
  doc.transact(() => {
    const item = doc.getMap("playlists").get(id);
    const order = item && item.get("order");
    if (!(order instanceof Y.Array)) return;
    const keys = order.toArray();
    if (from < 0 || from >= keys.length) return;
    const [key] = keys.splice(from, 1);
    keys.splice(Math.max(0, Math.min(to, keys.length)), 0, key);
    order.delete(0, order.length);
    order.insert(0, keys);
    item.set("updated_at", now);
  });
}
