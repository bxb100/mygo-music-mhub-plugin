import * as Y from "yjs";
import { authRequest, registerSessionClear, requireAccount } from "./api.js";
import { coverOf, resolveCollection, tracksOf } from "./catalog.js";
import { SYNC_INTERVAL } from "./constants.js";
import {
  appendTracks,
  createPlaylist as libraryCreatePlaylist,
  deletePlaylist as libraryDeletePlaylist,
  moveTrack,
  readLibrary,
  removeTrack,
  renamePlaylist as libraryRenamePlaylist,
} from "./library.js";
import type { LibraryPlaylist, LibraryTrackItem, PlaylistCard, PlaylistDetail, Track } from "./types.js";
import { fail, fromBase64, meta, sized, toBase64, tr, trackOf, unpack } from "./utils.js";

let library: { accountId: string; doc: Y.Doc } | null = null;
let serverState: Uint8Array | null = null;
let nextSync = 0;

registerSessionClear(() => {
  library = null;
  serverState = null;
  nextSync = 0;
});

function ensureLibrary(): Y.Doc {
  const me = requireAccount();
  if (library && library.accountId === me.id) return library.doc;
  const doc = new Y.Doc();
  const saved = host.storage.get("library:" + me.id) as { update?: string; serverSV?: string } | undefined;
  if (saved && saved.update) Y.applyUpdate(doc, fromBase64(saved.update));
  serverState = saved && saved.serverSV ? fromBase64(saved.serverSV) : null;
  library = { accountId: me.id, doc };
  return doc;
}

function persistLibrary() {
  if (!library) return;
  host.storage.set("library:" + library.accountId, {
    update: toBase64(Y.encodeStateAsUpdate(library.doc)),
    serverSV: serverState ? toBase64(serverState) : "",
  });
}

async function syncLibrary(force: boolean): Promise<Y.Doc> {
  const doc = ensureLibrary();
  if (!force && Date.now() < nextSync) return doc;
  const state = Y.encodeStateVector(doc);
  const update = Y.encodeStateAsUpdate(doc, serverState || undefined);
  const data = await authRequest<{ update?: string; state_vector?: string }>("/api/v1/sync/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state_vector: toBase64(state), update: toBase64(update) }),
  });
  if (data.update) Y.applyUpdate(doc, fromBase64(data.update));
  serverState = data.state_vector ? fromBase64(data.state_vector) : null;
  nextSync = Date.now() + SYNC_INTERVAL;
  persistLibrary();
  return doc;
}

function playlistCard(item: LibraryPlaylist, owner: string): PlaylistCard {
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

function libraryTrack(id: string): LibraryTrackItem {
  const ref = unpack(id);
  const info = meta.get(id) || {
    platform: ref.platform,
    trackId: ref.trackId,
    title: "",
    artist: "",
    album: "",
    duration: 0,
    cover: "",
  };
  return {
    platform: ref.platform,
    source_id: ref.trackId,
    song: info.title || ref.trackId,
    singer: info.artist || "",
    cover: info.cover || "",
  };
}

function libraryTracks(item: LibraryPlaylist): Track[] {
  return item.tracks.map((track) =>
    trackOf({
      platform: track.platform,
      id: track.source_id,
      song: track.title,
      singer: track.artist,
      cover: track.cover,
    }),
  );
}

export async function playlists(): Promise<PlaylistCard[]> {
  const me = requireAccount();
  const doc = await syncLibrary(false);
  return readLibrary(doc).playlists.map((item) => playlistCard(item, me.name));
}

export async function playlist({ id }: { id?: string }): Promise<PlaylistDetail> {
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
      mine: false,
      saved: false,
      tracks,
    };
  }
  const me = requireAccount();
  const doc = await syncLibrary(false);
  const item = readLibrary(doc).playlists.find((entry) => entry.id === target);
  if (!item) throw fail("unavailable", tr("That playlist is gone."));
  return { ...playlistCard(item, me.name), tracks: libraryTracks(item) };
}

export async function createPlaylist({ name }: { name: string }): Promise<PlaylistCard> {
  const me = requireAccount();
  const doc = await syncLibrary(false);
  const id = "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  libraryCreatePlaylist(doc, { id, name, tracks: [] });
  await syncLibrary(true);
  const item = readLibrary(doc).playlists.find((entry) => entry.id === id);
  if (!item) throw fail("unavailable", tr("That playlist is gone."));
  return playlistCard(item, me.name);
}

export async function renamePlaylist({ id, name }: { id: string; name: string }): Promise<void> {
  const doc = await syncLibrary(false);
  libraryRenamePlaylist(doc, id, name);
  await syncLibrary(true);
}

export async function deletePlaylist({ id }: { id: string }): Promise<void> {
  const doc = await syncLibrary(false);
  libraryDeletePlaylist(doc, id);
  await syncLibrary(true);
}

export async function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }): Promise<void> {
  const doc = await syncLibrary(false);
  appendTracks(doc, id, trackIds.map(libraryTrack));
  await syncLibrary(true);
}

export async function removeFromPlaylist({ id, trackIds }: { id: string; trackIds: string[] }): Promise<void> {
  const doc = await syncLibrary(false);
  for (const trackId of trackIds) removeTrack(doc, id, trackId);
  await syncLibrary(true);
}

export async function movePlaylistTrack({ id, from, to }: { id: string; from: number; to: number }): Promise<void> {
  const doc = await syncLibrary(false);
  moveTrack(doc, id, from, to);
  await syncLibrary(true);
}
