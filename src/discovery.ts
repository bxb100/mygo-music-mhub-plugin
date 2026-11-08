import { get } from "./api.js";
import { recentTracks } from "./recent.js";
import type { MHubHomeResource, MHubHomeResponse, PageResult, Section, ShelfAlbum, ShelfPlaylist } from "./types.js";
import { shelfAlbum, shelfPlaylist, tr, trackOf } from "./utils.js";

export async function home(): Promise<PageResult> {
  const data = await get<MHubHomeResponse>("/api/v1/recommendations/home", { limit: 12 });
  const sections: Section[] = [];
  const recents = recentTracks();
  if (recents.length) sections.push({ title: tr("Recently played"), tracks: recents.slice(0, 10) });
  const resources = new Map<string, MHubHomeResource>((data.playlists || []).map((item) => [String(item.id), item]));
  for (const tag of data.tags || []) {
    const items = (tag.playlist_ids || [])
      .map((id) => resources.get(String(id)))
      .filter((item): item is MHubHomeResource => item !== undefined);
    const playlists: ShelfPlaylist[] = items
      .filter((item) => item.resource_type !== "albums")
      .map((item) => shelfPlaylist(item));
    const albums: ShelfAlbum[] = items
      .filter((item) => item.resource_type === "albums")
      .map((item) => shelfAlbum(item));
    if (!playlists.length && !albums.length) continue;
    const section: Section = { title: tag.label };
    if (playlists.length) section.playlists = playlists;
    if (albums.length) section.albums = albums;
    sections.push(section);
  }
  const tracks = (data.tracks || []).map((item) => trackOf(item));
  if (tracks.length) sections.push({ title: tr("Recommended songs"), tracks });
  return { title: "MHub", sections };
}
