import { get } from "./api.js";
import type { MHubCollectionResponse, Track } from "./types.js";
import { platformOf, trackOf } from "./utils.js";

export async function resolveCollection(url: string): Promise<MHubCollectionResponse> {
  return get<MHubCollectionResponse>("/api/v1/collections/resolve", {
    platform: platformOf(url),
    url,
  });
}

export function tracksOf(data: MHubCollectionResponse, albumUrl?: string): Track[] {
  return (data.items || []).map((item) => trackOf(item, albumUrl ? { album: data.title, albumUrl } : undefined));
}

export function coverOf(tracks: Track[]): string {
  for (const track of tracks) {
    if (track.album && track.album.imageUrl) return track.album.imageUrl;
  }
  return "";
}

export async function album({ id }: { id?: string }) {
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
