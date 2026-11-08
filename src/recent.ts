import { RADIO_MAX, RECENT_MAX } from "./constants.js";
import type { Track } from "./types.js";
import { meta, trackFromMeta } from "./utils.js";

export function recentTracks(): Track[] {
  const value = host.storage.get("recent");
  return Array.isArray(value) ? (value as Track[]) : [];
}

export function recent(): Track[] {
  return recentTracks();
}

export function played({ id }: { id: string }): void {
  const info = meta.get(id);
  const previous = recentTracks().find((item) => item.id === id);
  const track = info ? trackFromMeta(id, info) : previous || { id, name: id, artists: [] };
  const recents = recentTracks().filter((item) => item.id !== id);
  host.storage.set("recent", [track, ...recents].slice(0, RECENT_MAX));
  const radio = host.storage.get("radio");
  const seen = Array.isArray(radio) ? (radio as string[]).filter((item) => item !== id) : [];
  host.storage.set("radio", [id, ...seen].slice(0, RADIO_MAX));
}
