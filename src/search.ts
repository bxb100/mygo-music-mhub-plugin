import { get } from "./api.js";
import { SEARCH_LIMIT } from "./constants.js";
import type { MHubCollectionItem, SearchResults } from "./types.js";
import { platform, trackOf } from "./utils.js";

export async function search({
  query,
  kind,
  offset,
}: {
  query?: string;
  kind?: string;
  offset?: number | string;
}): Promise<SearchResults> {
  const text = String(query || "").trim();
  if (!text || (kind && kind !== "tracks") || Number(offset || 0) > 0) return { more: false };
  const items = await get<MHubCollectionItem[]>("/api/v1/search", {
    platform: platform(),
    q: text,
    limit: SEARCH_LIMIT,
  });
  return { tracks: items.map((item) => trackOf(item)), more: false };
}

export async function suggest({ query }: { query?: string }): Promise<string[]> {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const items = await get<MHubCollectionItem[]>("/api/v1/search", {
      platform: platform(),
      q: text,
      limit: 6,
    });
    return items
      .map((item) => item.song)
      .filter((name, index, names): name is string => Boolean(name && names.indexOf(name) === index));
  } catch (error) {
    console.warn("MHub suggest: " + (error instanceof Error ? error.message : ""));
    return [];
  }
}
