import { resolveCollection, tracksOf } from "./catalog.js";
import { APPLE_NEW_TTL, APPLE_NEW_URL } from "./constants.js";
import { playlists } from "./playlists.js";
import type { PageResult, Section, ShelfAlbum, ShelfPlaylist } from "./types.js";
import { fail, shelfAlbum, shelfPlaylist, tr } from "./utils.js";

let appleNewCache: Section[] | null = null;
let appleNewAt = 0;

interface AppleMusicSectionItem {
  contentDescriptor?: { url?: string; kind?: string };
  titleLinks?: { title?: string }[];
  title?: string;
  artwork?: { dictionary?: { url?: string } };
}

interface AppleMusicSection {
  id?: string;
  items?: AppleMusicSectionItem[];
}

function appleSection(section: AppleMusicSection | undefined, title: string): Section | null {
  if (!section) return null;
  const playlistItems: ShelfPlaylist[] = [];
  const albumItems: ShelfAlbum[] = [];
  for (const item of section.items || []) {
    const descriptor = item.contentDescriptor || {};
    const link = (item.titleLinks && item.titleLinks[0]) || {};
    const name = link.title || item.title || "";
    const url = descriptor.url || "";
    const cover = (((item.artwork || {}).dictionary || {}).url || "").replace(
      /\{w\}x\{h\}([^/]*)\.\{f\}/i,
      (_match, crop) => "1080x1080" + crop.replace("{c}", "bb") + ".jpg",
    );
    if (!name || !url) continue;
    if (descriptor.kind === "playlist") {
      playlistItems.push(shelfPlaylist({ name, url, cover, curator: "Apple Music" }, true));
    } else if (descriptor.kind === "album") {
      albumItems.push(shelfAlbum({ name, url, cover, curator: "Apple Music" }, true));
    }
  }
  if (!playlistItems.length && !albumItems.length) return null;
  return { title, playlists: playlistItems, albums: albumItems };
}

async function appleNewSections(): Promise<Section[]> {
  if (appleNewCache && Date.now() - appleNewAt < APPLE_NEW_TTL) return appleNewCache;
  const response = await fetch(APPLE_NEW_URL, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error("Apple Music " + response.status + " " + response.statusText);
  const html = await response.text();
  const match = html.match(/<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Apple Music page changed.");
  const data = JSON.parse(match[1]) as {
    data?: { data?: { sections?: AppleMusicSection[] } }[];
  };
  const root = (data.data || [])[0] || {};
  const sections = (root.data || {}).sections || [];
  const find = (id: string) => sections.find((section) => String(section.id || "").indexOf(id) !== -1);
  const validSections = [
    appleSection(find("6831386381"), tr("Everyone's Listening")),
    appleSection(find("6505052377"), tr("Weekly Top 100")),
    appleSection(find("6504784714"), tr("City Charts")),
  ].filter((s): s is Section => s !== null);
  appleNewCache = validSections;
  appleNewAt = Date.now();
  return appleNewCache;
}

async function discover(): Promise<PageResult> {
  try {
    return { title: tr("Discover"), sections: await appleNewSections() };
  } catch (error) {
    console.warn("Apple Music new: " + (error instanceof Error ? error.message : ""));
    return { title: tr("Discover"), sections: [] };
  }
}

async function collectionPage(url: string, isAlbum: boolean): Promise<PageResult> {
  const data = await resolveCollection(url);
  const tracks = tracksOf(data, isAlbum ? url : "");
  return { title: data.title, sections: tracks.length ? [{ tracks }] : [] };
}

export async function browse({ page }: { page?: string }): Promise<PageResult> {
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
