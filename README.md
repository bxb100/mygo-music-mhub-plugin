# MHub for MyGo Music

Plays music from [MHub](https://github.com/jizizr/mhub) in [MyGo Music](https://github.com/egoist/mygo-music). No account or API key is needed for search and playback.

接口映射和调用时序见 [doc/mhub-api.md](doc/mhub-api.md)；MyGo 插件接口本身见
[doc/mygo-plugin-api.md](doc/mygo-plugin-api.md)。

## Settings

- **Search platform**: `applemusic`, `netease`, `bilibili`, `tencent` or `youtubemusic`; defaults to `applemusic`.

酷狗和汽水音乐已由服务端下线；QQ 音乐能搜索，但当前直链获取被风控，播放会报错。Apple Music、网易云、
哔哩哔哩和 YouTube Music 可正常播放。

## Signing in

Sign in from the plugin's account button. The app opens `https://music.op.wiki/` in its sign-in window; after you
finish signing in there, the plugin keeps the `mhub_session` cookie in this plugin's data on this device.

Passkey login does not work in the app's sign-in window. Its WKWebView exposes `PublicKeyCredential` and
`navigator.credentials`, but `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` returns `false`,
so MHub's discoverable passkey challenge cannot be completed. The plugin's JavaScript runtime also has no
`navigator.credentials`, so it cannot perform the WebAuthn assertion itself. Use the password login.

## What works

- Home: sections from MHub's recommended home, ordered by its tags, plus recommended songs.
- Discover: Everyone's Listening, Weekly Top 100 and City Charts from
  [Apple Music New](https://music.apple.com/new).
- Search, with suggestions.
- Playlists and albums opened from Home, resolved through `/api/v1/collections/resolve`.
- Lyrics, including the service's cross-source matched translation.
- Recently played, kept on this device.
- Endless Radio, seeded by the last Apple Music track you played.
- After signing in: your MHub playlists appear in the sidebar's **My Playlists** group and sync through MHub's Yjs
  library document. Creating, renaming, deleting, adding, removing and reordering tracks are written back to MHub.

Without an account, liked songs, saved albums, artists, podcasts and stations other than the generated radio are
hidden.

## How it plays

`stream` creates a playback task, polls `status_url` until `completed`, then hands the app the `audio_url` from the
completed task. A cold track usually takes a few seconds; cached tracks are immediate. The task is shared server-side,
so the same song and quality are reused. ALAC packet streaming is not used.

## Lyrics

`lyrics` queries `/api/v1/lyrics` with the platform, track ID and any metadata known from search or playback, so the
service can fall back to NetEase, QQ, Kugou and Kuwo matches and align translations.

## Playlist sync

MHub's web app stores account playlists in a Yjs document and syncs it through `/api/v1/sync/library`. The plugin
uses the same document format: it sends its state vector and diff, applies the returned update, and polls at most
every 5 seconds when a playlist is opened. The document is kept in this plugin's data, keyed by account ID.

## Development

`index.js` is generated from `src/`:

```bash
npm install
npx esbuild src/yjs-entry.js --bundle --format=iife --minify --target=es2020 --outfile=src/yjs.bundle.js
./build.sh
```

The vendored bundle is [Yjs](https://github.com/yjs/yjs) plus `src/library.js`, the small part of MHub's playlist
document format this plugin reads and writes.
