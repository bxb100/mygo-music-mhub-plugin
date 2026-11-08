# MyGo Music 插件 API 参考

来源：[egoist/mygo-music README](https://github.com/egoist/mygo-music#publishing-a-plugin) 与
[`internal/music/music.go`](https://github.com/egoist/mygo-music/blob/main/internal/music/music.go)，
整理于 2026-11-07。

## 插件是什么

一个插件就是应用 `plugins` 目录里的一个文件夹：

```
my-plugin/
  plugin.json
  index.js          # 或 index.ts，单个入口文件
  locales/
    zh-CN.json      # 可选
```

插件运行在所有平台上，不需要构建。入口文件导出一个函数对应一种能力；
没有导出的能力，应用会在界面上隐藏。

## plugin.json

```json
{
  "id": "example",
  "name": "Example",
  "version": "1.0.0",
  "minAppVersion": "0.1.8",
  "main": "index.js",
  "playback": "stream",
  "permissions": { "network": ["api.example.com"] },
  "settings": [
    {
      "key": "apiKey",
      "label": "API Key",
      "help": "From your account page",
      "link": "https://example.com/keys"
    }
  ],
  "navigation": [
    { "builtin": "home" },
    { "title": "Charts", "page": "charts", "icon": "chart" },
    { "title": "Stations", "builtin": "stations" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 插件标识 |
| `name` | 显示名称，可被 `locales` 翻译 |
| `version` | 插件版本 |
| `minAppVersion` | 兼容的最老应用版本；更老的应用拒绝安装并提示升级。0.1.8 之前的版本不读这个字段。在 `imageUrl` 里用 `{size}` 的插件填 `0.1.20` |
| `main` | 入口文件，JavaScript 或 TypeScript |
| `playback` | `stream`：应用播放 `stream` 返回的音频；`remote`：插件自己发声，应用调用 `remote*` |
| `permissions.network` | `fetch` 能访问的主机，支持 `*.example.com`；`["*"]` 允许任意主机；缺省则不能访问网络 |
| `permissions.process` | `host.spawn` 能启动的程序；路径或 PATH 中的名字，支持 `*` 通配；`["*"]` 或 `true` 表示任意程序 |
| `settings` | 账号等设置项：`{key, label, help, link}` |
| `navigation` | 侧边栏，按顺序显示 |

`navigation` 每一项：

```json
{ "title": "Charts", "page": "charts", "icon": "chart" }
{ "builtin": "home" }
```

- `page` 打开插件自己的 `browse` 页面。
- `builtin` 使用应用页面：`home`、`liked`、`savedAlbums`、`stations`、`shows`，可同时给 `title`。
- `icon`：`home`、`note`、`album`、`artist`、`playlist`、`radio`、`podcast`、`chart`、`calendar`、`heart`、`search`、`star`。
- 不写 `navigation` 时，侧边栏为插件能做的每个应用页面各生成一项。

## 导出函数

每个导出接收一个参数对象，返回一个值或 Promise。除特别说明外都可以是异步的。

| 导出 | 参数 | 返回 |
| --- | --- | --- |
| `signIn` | — | `{id, name, imageUrl}` |
| `signOut` | — | — |
| `account` | — | `{id, name, imageUrl}`，未登录时 `null` |
| `setSetting` | `{key, value}` | — |
| `home` | — | `Browse` |
| `browse` | `{page}` | `Browse` |
| `search` | `{query, kind, offset}` | `{tracks/albums/artists/playlists/shows, more}` |
| `suggest` | `{query}` | `[string]` |
| `recent` | — | `[Track]` |
| `played` | `{id}` | — |
| `liked` | `{offset}` | `{tracks, more}` |
| `isLiked` | `{ids}` | `{id: bool}` |
| `like` | `{id, on}` | — |
| `likeEpisode` | `{id, on}` | — |
| `album` | `{id}` | `{album, tracks}` |
| `artist` | `{id}` | `{artist, tracks, albums}` |
| `saveAlbum` | `{id, on}` | — |
| `followArtist` | `{id, on}` | — |
| `savedAlbums` | `{offset}` | `{albums, more}` |
| `playlists` | — | `[Playlist]` |
| `playlist` | `{id}` | 带 `tracks` 的 `Playlist` |
| `createPlaylist` | `{name}` | `Playlist` |
| `renamePlaylist` | `{id, name}` | — |
| `deletePlaylist` | `{id}` | — |
| `addToPlaylist` | `{id, trackIds}` | — |
| `removeFromPlaylist` | `{id, trackIds}` | — |
| `movePlaylistTrack` | `{id, from, to}` | — |
| `savePlaylist` | `{id, on}` | — |
| `shows` | — | `[Show]` |
| `show` | `{id, offset}` | `{show, episodes, more}` |
| `subscribeShow` | `{id, on}` | — |
| `stations` | — | `[Station]` |
| `stationNext` | `{id}` | `[Track]` |
| `comments` | `{trackId, offset}` | `{comments, total, more}` |
| `likeComment` | `{trackId, commentId, on}` | — |
| `postComment` | `{trackId, text}` | `Comment` |
| `lyrics` | `{id}` | `{lrc, translation}` 或 `{lines}` |
| `stream` | `{id, quality}` | `{url, type, headers, size, gain, peak}` |
| `remotePlay` | `{ids, start, position}` | — |
| `remotePause` / `remoteResume` | — | — |
| `remoteSeek` | `{position}` | — |
| `remoteVolume` | `{percent}` | — |
| `remoteState` | — | `RemoteState` 或 `null` |
| `remoteDevices` | — | `[{id, name, active}]` |
| `remoteUse` | `{deviceId}` | — |

`search` 的 `kind`：`tracks`、`albums`、`artists`、`playlists`、`shows`。

## 数据模型

字段名就是 JSON 名；时间单位为毫秒。

### 图片尺寸

`imageUrl` 可以用 `{size}` 表示应用显示图片的宽度，服务端按这个尺寸出图：

```json
{ "imageUrl": "https://img.example.com/cover.jpg?param={size}y{size}" }
{ "imageUrl": "https://img.example.com/{size}/cover.jpg" }
```

应用把 `{size}` 换成显示的像素数：列表行 40，Now Playing 600；没有指定尺寸的地方用
600。查询串里被 JavaScript 的 `URL` 写成 `%7Bsize%7D` 也算。

0.1.20 之前的应用会把 `{size}` 原样请求，所以给出占位符的插件要把
`minAppVersion` 设为 `0.1.20`。不用占位符时不要给原图：应用会下载并解码整张图片，
几千像素的原图有几 MB，却只显示在列表里；服务能缩放就给 800 像素左右。

### Artist

```json
{ "id": "a1", "name": "The Examples", "imageUrl": "…", "following": false }
```

### Album

```json
{
  "id": "al1",
  "name": "First Album",
  "imageUrl": "…",
  "artists": [{ "id": "a1", "name": "The Examples" }],
  "released": "2026-01-01",
  "saved": false
}
```

### Track

```json
{
  "id": "t1",
  "name": "Song 1",
  "artists": [{ "id": "a1", "name": "The Examples" }],
  "album": { "id": "al1", "name": "First Album" },
  "duration": 12000,
  "url": "…",
  "unavailable": false,
  "showId": "",
  "description": "",
  "published": ""
}
```

`duration` 为毫秒。`source` 由应用填写，插件不用给。

### Playlist

```json
{
  "id": "p1",
  "name": "Favourites",
  "imageUrl": "…",
  "description": "…",
  "owner": "…",
  "trackCount": 3,
  "mine": true,
  "saved": false,
  "tracks": []
}
```

### Show / Station / Comment

```json
{ "id": "s1", "name": "The Show", "imageUrl": "…", "description": "…", "publisher": "…", "episodeCount": 2, "subscribed": false }
{ "id": "st1", "name": "Endless", "description": "…", "imageUrl": "…" }
{ "id": "c1", "author": "…", "avatarUrl": "…", "text": "…", "time": 1767225600000, "likes": 2, "liked": false }
```

播客的一集是带 `showId`、`description`、`published` 的 Track。

### Browse / Section / Link / NavItem

```json
{
  "title": "Discover",
  "subtitle": "…",
  "sections": [
    {
      "title": "Artists",
      "tracks": [],
      "albums": [],
      "artists": [],
      "playlists": [],
      "shows": [],
      "stations": [],
      "links": [{ "title": "Charts", "subtitle": "…", "imageUrl": "…", "page": "charts" }],
      "morePage": "charts:2"
    }
  ]
}
```

一个 Section 可以同时放几种内容，按字段顺序显示。

### Stream / Lyrics

```json
{ "url": "https://…/song.mp3", "type": "mp3", "quality": "high", "size": 123, "headers": {}, "gain": 0, "peak": 0 }
```

`type`：`mp3`、`flac`、`ogg`、`wav`、`m4a` 或 `aac`。

```json
{ "lrc": "[00:01.00]A line", "translation": "[00:01.00]译文" }
```

```json
{
  "lines": [
    {
      "start": 1000,
      "end": 3000,
      "text": "A line",
      "translation": "…",
      "words": [{ "start": 1000, "end": 1600, "text": "Word " }]
    }
  ]
}
```

有 `lines` 时应用优先使用它。

## 错误

抛出的 Error 可以带 `code`：

| code | 应用行为 |
| --- | --- |
| `signIn` | 提示用户登录 |
| `setup` | 打开插件设置 |
| `unavailable` | 表示无法播放/获取 |
| `unsupported` | 表示插件不支持该能力 |

其他错误直接显示 `message`。

## host 对象

| API | 说明 |
| --- | --- |
| `host.platform` / `host.arch` | 如 `darwin`、`arm64` |
| `host.dir` | 插件目录 |
| `host.dataDir` | 插件数据目录 |
| `host.storage.get(key)` / `.set(key, value)` / `.remove(key)` | 持久化 JSON 值 |
| `host.setting(key)` | 用户在设置里填的值 |
| `host.t(text)` / `host.language()` | 翻译文本；语言为 `en` 或 `zh-CN` |
| `host.removeDataDir(name)` | 删除 `host.dataDir` 下的文件夹 |
| `host.crypto.md5(text)` | MD5 十六进制 |
| `host.crypto.aesEcbEncrypt(key, text)` | AES-ECB + PKCS#7，十六进制 |
| `host.openURL(url)` | 用浏览器打开 |
| `host.signInPrompt({qr, text})` | 登录窗口显示二维码/提示 |
| `host.waitForRedirect({port, path, timeout, page})` | 等待浏览器登录回调，需要网络权限 |
| `host.webSignIn({url, cookiesOf, until, userAgent})` | 在应用内窗口完成网页登录，返回 `{cookie}` |
| `host.spawn(command, args)` | 启动程序，需要进程权限；返回 `{pid, write, closeStdin, readLine, wait, kill, errorOutput}` |

插件还能使用 JavaScript 标准库、定时器、`fetch`、`URL`、`console`。

## 多语言

`locales/zh-CN.json` 把英文文案映射到中文：

```json
{ "Example": "示例", "API Key": "API 密钥", "Charts": "排行榜" }
```

应用会翻译插件的 `name`、设置项的 `label`/`help`、`navigation` 的 `title`；
插件自己输出的文案用 `host.t(text)`。

## 发布

1. 把插件放进一个公开的 GitHub 仓库，`plugin.json` 在仓库根目录。
2. 应用取最新 release 中名为 `plugin-<platform>.zip`（如 `plugin-darwin-arm64.zip`）的资产，
   或没有平台名的 zip，或者源码；没有 release 就取默认分支最新提交。
3. 新 tag 或新提交会被视为新版本，在设置中显示为更新。权限变多时应用会再次征求用户同意。
4. 给仓库加 `mygo-music-plugin` topic，就会出现在插件列表页。
5. 安装链接：`mygo-music://install-plugin?repo=owner/repo`；
   开发版应用使用 `mygo-music-dev://`。

## 参考

- https://github.com/egoist/mygo-music#plugins
- https://github.com/egoist/mygo-music#publishing-a-plugin
- https://github.com/egoist/mygo-music/blob/main/internal/music/music.go
- https://github.com/egoist/mygo-music/tree/main/examples/demo-plugin
