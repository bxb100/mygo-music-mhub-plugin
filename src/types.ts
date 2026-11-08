export interface Host {
  storage: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
  setting(key: string): string;
  language(): string;
  t(text: string): string;
  webSignIn(options: {
    url: string;
    cookiesOf: string;
    until: string[];
    userAgent?: string;
  }): Promise<{ cookie: string }>;
}

declare global {
  const host: Host;
}

export interface Account {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface Artist {
  id: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  name: string;
  imageUrl: string;
}

export interface Track {
  id: string;
  name: string;
  artists: Artist[];
  album?: AlbumRef;
  duration?: number;
}

export interface TrackMeta {
  platform: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
}

export interface PlaylistCard {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  owner: string;
  trackCount: number;
  mine: boolean;
  saved: boolean;
}

export interface PlaylistDetail extends PlaylistCard {
  tracks: Track[];
}

export interface ShelfPlaylist {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  owner: string;
  trackCount: number;
}

export interface ShelfAlbum {
  id: string;
  name: string;
  imageUrl: string;
  artists: Artist[];
}

export interface Section {
  title?: string;
  playlists?: (ShelfPlaylist | PlaylistCard)[];
  albums?: ShelfAlbum[];
  tracks?: Track[];
}

export interface PageResult {
  title: string;
  sections: Section[];
}

export interface SearchResults {
  tracks?: Track[];
  more: boolean;
}

export interface LyricsResult {
  lrc: string;
  translation?: string;
}

export interface StreamResult {
  url: string;
  type: string;
  quality: string;
  size?: number;
}

export interface Station {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}

export interface LibraryTrackItem {
  platform: string;
  source_id: string;
  song?: string;
  singer?: string;
  cover?: string;
  title?: string;
  artist?: string;
}

export interface LibraryPlaylist {
  id: string;
  name: string;
  platform: string;
  source_id: string;
  source_url: string;
  source_platform: string;
  source_keys: string[] | null;
  synced_at: number;
  cover: string;
  created_at: number;
  updated_at: number;
  tracks: {
    key: string;
    platform: string;
    source_id: string;
    title: string;
    artist: string;
    cover: string;
  }[];
}

export interface LibraryData {
  playlists: LibraryPlaylist[];
  liked: string[];
  less: string[];
}

export interface MHubPlaybackTask {
  id?: string;
  status?: string;
  audio_url?: string;
  byte_size?: number;
  format?: string;
  content_type?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  error?: string;
}

export interface MHubPlaybackResponse {
  playback: MHubPlaybackTask;
  status_url?: string;
  audio_url?: string;
}

export interface MHubUser {
  id: string | number;
  username?: string;
}

export interface MHubAuthMeResponse {
  user?: MHubUser;
}

export interface MHubCollectionItem {
  id: string;
  platform: string;
  song?: string;
  title?: string;
  singer?: string;
  cover?: string;
}

export interface MHubCollectionResponse {
  title: string;
  items?: MHubCollectionItem[];
}

export interface MHubHomeTag {
  label: string;
  playlist_ids?: (string | number)[];
}

export interface MHubHomeResource {
  id: string | number;
  resource_type?: string;
  name?: string;
  cover?: string;
  description?: string;
  curator?: string;
  url?: string;
}

export interface MHubHomeResponse {
  tags?: MHubHomeTag[];
  playlists?: MHubHomeResource[];
  tracks?: MHubCollectionItem[];
}

export interface MHubLyricsResponse {
  available?: boolean;
  plain?: string;
  translation?: string;
}

export interface MHubRecommendationResponse {
  tracks?: MHubCollectionItem[];
}
