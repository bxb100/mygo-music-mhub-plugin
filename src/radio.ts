import { get, post } from "./api.js";
import { recentTracks } from "./recent.js";
import type { MHubCollectionItem, MHubRecommendationResponse, Station, Track } from "./types.js";
import { tr, trackOf, unpack } from "./utils.js";

export function stations(): Station[] {
  const last = recentTracks()[0];
  const station: Station = {
    id: "continue",
    name: tr("Endless Radio"),
    description: tr("New songs from your last played track"),
  };
  if (last && last.album && last.album.imageUrl) station.imageUrl = last.album.imageUrl;
  return [station];
}

export async function stationNext(): Promise<Track[]> {
  const radio = host.storage.get("radio");
  const history = Array.isArray(radio) ? (radio as string[]) : [];
  const seeds = history
    .map((item) => unpack(item))
    .filter((ref) => ref.platform === "applemusic" && /^\d+$/.test(ref.trackId))
    .map((ref) => ref.trackId);
  if (!seeds.length) {
    const pool = await get<MHubCollectionItem[]>("/api/v1/recommendations", {
      platform: "applemusic",
      limit: 1,
    });
    if (pool.length && /^\d+$/.test(pool[0].id)) seeds.push(pool[0].id);
  }
  if (!seeds.length) return [];
  try {
    const data = await post<MHubRecommendationResponse>("/api/v1/recommendations/continue", {
      platform: "applemusic",
      seed_id: seeds[0],
      exclude: seeds.slice(0, 1000),
      limit: 20,
    });
    if (data.tracks && data.tracks.length) return data.tracks.map((item) => trackOf(item));
  } catch (error) {
    console.warn("MHub radio: " + (error instanceof Error ? error.message : ""));
  }
  const fallback = await get<MHubCollectionItem[]>("/api/v1/recommendations", {
    platform: "applemusic",
    limit: 20,
  });
  return fallback.map((item) => trackOf(item));
}
