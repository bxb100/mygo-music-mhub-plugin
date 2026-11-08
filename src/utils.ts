import { ALIASES, BASE, HOSTS, QUALITIES } from "./constants.js";
import type { Artist, ShelfAlbum, ShelfPlaylist, Track, TrackMeta } from "./types.js";

export const tr = (text: string) => host.t(text);

export const meta = new Map<string, TrackMeta>();

export function fail(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export function setting(key: string) {
  const value = host.setting(key);
  return value == null ? "" : String(value).trim();
}

export function platform() {
  const raw = setting("platform").toLowerCase();
  if (!raw) return "applemusic";
  return ALIASES[raw] || raw;
}

export function level(wanted?: string) {
  const value = String(wanted || "high").toLowerCase();
  return QUALITIES.indexOf(value) === -1 ? "high" : value;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function absolute(url?: string) {
  if (!url) return "";
  try {
    return new URL(url, BASE + "/").toString();
  } catch {
    return String(url);
  }
}

export function sized(url?: string) {
  if (!url) return "";
  let text = String(url);
  if (text.indexOf("{w}x{h}") !== -1) {
    return text.replace(/\{w\}x\{h\}([^/]*)\.\{f\}/i, (_match, crop) => {
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

export function queryOf(params?: Record<string, unknown>) {
  if (!params) return "";
  const pairs: string[] = [];
  for (const key in params) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  }
  return pairs.length ? "?" + pairs.join("&") : "";
}

export function messageOf(body: unknown, response: Response) {
  if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
    return body.detail;
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 300);
  return response.status + " " + response.statusText;
}

export function toBase64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    text += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 32768)));
  }
  return btoa(text);
}

export function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function platformOf(url?: string) {
  const text = String(url || "");
  for (const pair of HOSTS) {
    if (text.indexOf(pair[0]) !== -1) return pair[1];
  }
  return platform();
}

export function artistsOf(name?: string): Artist[] {
  const text = String(name || "").trim();
  return text ? [{ id: "artist:" + text, name: text }] : [];
}

export function unpack(id?: string | null) {
  const text = String(id == null ? "" : id);
  const at = text.indexOf(":");
  if (at === -1) return { platform: platform(), trackId: text };
  return { platform: text.slice(0, at), trackId: text.slice(at + 1) };
}

export function trackOf(
  item: {
    id: string;
    platform: string;
    song?: string;
    title?: string;
    singer?: string;
    cover?: string;
  },
  extra?: {
    album?: string;
    albumUrl?: string;
    cover?: string;
    artist?: string;
    duration?: number;
  },
): Track {
  const album = (extra && extra.album) || "";
  const cover = sized(item.cover || (extra && extra.cover) || "");
  const id = item.platform + ":" + item.id;
  const track: Track = {
    id,
    name: item.song || item.title || item.id,
    artists: artistsOf(item.singer || (extra && extra.artist)),
  };
  if (album || cover) {
    track.album = {
      id: album && extra?.albumUrl ? "al:" + extra.albumUrl : "",
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

export function trackFromMeta(id: string, info: TrackMeta): Track {
  const track: Track = { id, name: info.title || id, artists: artistsOf(info.artist) };
  if (info.album || info.cover) {
    track.album = { id: "", name: info.album || "", imageUrl: info.cover || "" };
  }
  if (info.duration) track.duration = Math.round(info.duration * 1000);
  return track;
}

export function shelfPlaylist(
  item: {
    id?: string | number;
    url?: string;
    name?: string;
    cover?: string;
    description?: string;
    curator?: string;
  },
  fixed?: boolean,
): ShelfPlaylist {
  return {
    id: "pl:" + (item.url || item.id),
    name: item.name || "",
    imageUrl: fixed ? item.cover || "" : sized(item.cover || ""),
    description: item.description || "",
    owner: item.curator || "",
    trackCount: 0,
  };
}

export function shelfAlbum(
  item: {
    id?: string | number;
    url?: string;
    name?: string;
    cover?: string;
    curator?: string;
  },
  fixed?: boolean,
): ShelfAlbum {
  return {
    id: "al:" + (item.url || item.id),
    name: item.name || "",
    imageUrl: fixed ? item.cover || "" : sized(item.cover || ""),
    artists: artistsOf(item.curator),
  };
}
