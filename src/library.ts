import * as Y from "yjs";
import type { LibraryData, LibraryPlaylist, LibraryTrackItem } from "./types.js";

const unnamed = "未命名歌单";

export interface StoredTrack {
  platform: string;
  source_id: string;
  title: string;
  artist: string;
  cover: string;
}

export interface CreatePlaylistOptions {
  id: string;
  name: string;
  platform?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  sourceKeys?: string[] | null;
  cover?: string;
  tracks?: LibraryTrackItem[];
  now?: number;
}

function trackKey(track: LibraryTrackItem & { selected_id?: string; track_id?: string; id?: string }) {
  const platform = String(track.platform || "")
    .trim()
    .toLowerCase();
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

function trackMeta(
  track: LibraryTrackItem & {
    selected_id?: string;
    track_id?: string;
    id?: string;
    cover_url?: string;
  },
): StoredTrack {
  return {
    platform: track.platform || "",
    source_id: String(track.source_id || track.selected_id || track.track_id || track.id || ""),
    title: track.title || track.song || "",
    artist: track.artist || track.singer || "",
    cover: track.cover || track.cover_url || "",
  };
}

function putTracks(trackMap: Y.Map<StoredTrack>, tracks?: LibraryTrackItem[]) {
  const keys: string[] = [];
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

export function readLibrary(doc: Y.Doc): LibraryData {
  const playlists = doc.getMap("playlists");
  const tracks = doc.getMap<StoredTrack>("tracks");
  const taste = doc.getMap("taste");
  const result: LibraryPlaylist[] = [];

  playlists.forEach((item, id) => {
    if (!(item instanceof Y.Map)) return;
    const order = item.get("order");
    const keys = order instanceof Y.Array ? (order.toArray() as string[]) : [];
    const seen = new Set<string>();
    const list: (StoredTrack & { key: string })[] = [];
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const track = tracks.get(key);
      if (track) list.push({ ...track, key });
    }
    result.push({
      id,
      name: (item.get("name") as string) || unnamed,
      platform: (item.get("platform") as string) || "",
      source_id: (item.get("source_id") as string) || "",
      source_url: (item.get("source_url") as string) || "",
      source_platform: (item.get("source_platform") as string) || "",
      source_keys: Array.isArray(item.get("source_keys")) ? (item.get("source_keys") as string[]) : null,
      synced_at: (item.get("synced_at") as number) || 0,
      cover: (item.get("cover") as string) || (list[0] && list[0].cover) || "",
      created_at: (item.get("created_at") as number) || 0,
      updated_at: (item.get("updated_at") as number) || 0,
      tracks: list,
    });
  });

  result.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));

  const tasteKeys = (name: string) => {
    const value = taste.get(name);
    return value instanceof Y.Array ? [...new Set(value.toArray() as string[])] : [];
  };

  return { playlists: result, liked: tasteKeys("liked"), less: tasteKeys("less") };
}

export function createPlaylist(
  doc: Y.Doc,
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
  }: CreatePlaylistOptions,
) {
  doc.transact(() => {
    const playlists = doc.getMap("playlists");
    const trackMap = doc.getMap<StoredTrack>("tracks");
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
    const order = new Y.Array<string>();
    order.push(keys);
    item.set("order", order);
    playlists.set(id, item);
  });
}

export function appendTracks(doc: Y.Doc, id: string, tracks: LibraryTrackItem[], now = Date.now()): number {
  let added = 0;
  doc.transact(() => {
    const playlists = doc.getMap("playlists");
    const item = playlists.get(id);
    if (!(item instanceof Y.Map)) return;
    const order = item.get("order");
    if (!(order instanceof Y.Array)) return;
    const have = new Set(order.toArray() as string[]);
    const trackMap = doc.getMap<StoredTrack>("tracks");
    const keys = putTracks(trackMap, tracks).filter((key) => !have.has(key) && have.add(key));
    if (!keys.length) return;
    order.push(keys);
    if (!item.get("cover")) item.set("cover", (tracks[0] && tracks[0].cover) || "");
    item.set("updated_at", now);
    added = keys.length;
  });
  return added;
}

export function removeTrack(doc: Y.Doc, id: string, key: string, now = Date.now()) {
  doc.transact(() => {
    const playlists = doc.getMap("playlists");
    const item = playlists.get(id);
    if (!(item instanceof Y.Map)) return;
    const order = item.get("order");
    if (!(order instanceof Y.Array)) return;
    const keys = order.toArray() as string[];
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i] === key) order.delete(i, 1);
    }
    item.set("updated_at", now);
  });
}

export function renamePlaylist(doc: Y.Doc, id: string, name: string, now = Date.now()) {
  doc.transact(() => {
    const playlists = doc.getMap("playlists");
    const item = playlists.get(id);
    if (!(item instanceof Y.Map)) return;
    item.set("name", String(name || unnamed).trim() || unnamed);
    item.set("updated_at", now);
  });
}

export function deletePlaylist(doc: Y.Doc, id: string) {
  doc.transact(() => doc.getMap("playlists").delete(id));
}

export function moveTrack(doc: Y.Doc, id: string, from: number, to: number, now = Date.now()) {
  doc.transact(() => {
    const playlists = doc.getMap("playlists");
    const item = playlists.get(id);
    if (!(item instanceof Y.Map)) return;
    const order = item.get("order");
    if (!(order instanceof Y.Array)) return;
    const keys = order.toArray() as string[];
    if (from < 0 || from >= keys.length) return;
    const [key] = keys.splice(from, 1);
    keys.splice(Math.max(0, Math.min(to, keys.length)), 0, key);
    order.delete(0, order.length);
    order.insert(0, keys);
    item.set("updated_at", now);
  });
}
