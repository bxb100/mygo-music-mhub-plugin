# MHub API 使用说明

MHub 插件使用 [MHub OpenAPI](https://music.op.wiki/docs/api/openapi.json)（`1.3.0`，文档更新于
2026-10-20）中的公开读取、推荐、歌词和播放接口，以及网页版使用、但未写入 OpenAPI 的登录与歌单同步
接口。发现页还会直接读取 Apple Music 的 `/new` 页面生成编辑板块。本文总结插件实际调用的部分；
完整字段和所有响应码以 OpenAPI 原文为准。

## 基础约定

| 项目 | 值 |
| --- | --- |
| API 基址 | `https://music.op.wiki` |
| 媒体基址 | `https://music.zr.wiki`，仅用于 `completed` 的普通音频 |
| 鉴权 | 搜索、推荐、歌词和播放匿名；账号与歌单同步使用 `mhub_session` Cookie |
| 请求头 | 匿名请求发送 `Accept: application/json`；账号与同步请求另带 `x-mhub-client: 1`；JSON 请求带 `Content-Type: application/json` |
| URL 解析 | 返回值可为相对路径，以 API 基址解析；绝对 URL 原样使用并保留全部查询参数，尤其是 `rev` |
| 网络权限 | `music.op.wiki`、`music.zr.wiki`、`music.apple.com` |

不要转发浏览器的 `sec-ch-ua`、`Referer` 等请求头。音频下载本身是匿名请求，不携带 Cookie。

## 接口清单

| 方法 | 路径 | 插件用途 |
| --- | --- | --- |
| `GET` | `/api/v1/search` | 搜索歌曲、搜索联想 |
| `GET` | `/api/v1/recommendations` | 电台种子与兜底 |
| `GET` | `/api/v1/recommendations/home` | 首页栏目 |
| `POST` | `/api/v1/recommendations/continue` | 无限电台续播 |
| `GET` | `/api/v1/collections/resolve` | 打开歌单或专辑 |
| `GET` | `/api/v1/lyrics` | 获取歌词与翻译 |
| `POST` | `/api/v1/playbacks` | 创建或复用播放任务 |
| `GET` | `/api/v1/playbacks/{id}` | 轮询播放任务状态 |
| `HEAD` | `/api/v1/playbacks/{id}/audio` | 探测实际音频类型与长度 |
| `GET` | `/api/v1/auth/me` | 读取当前账号 |
| `POST` | `/api/v1/auth/logout` | 退出登录 |
| `POST` | `/api/v1/sync/library` | 同步歌单 Yjs 文档 |

插件不使用 `/platforms`、`GET /recommendations/continue`、`/match`、`/audio/stream`、
`/playbacks/{id}/cover`、`/playbacks/{id}/lyrics`、`/playbacks/{id}/loudness`、
`/auth/register`、`/auth/password/login`、`/auth/recovery/login`、`/auth/password`、
`/auth/passkey/*`、`/auth/sessions` 和 `/sync/ws`。

发现页另有一个非 MHub 请求：`GET https://music.apple.com/cn/new`。

## 登录与歌单同步

登录通过应用内网页完成：

```js
host.webSignIn({ url: BASE + "/", cookiesOf: BASE + "/", until: ["mhub_session"] });
```

`webSignIn` 在登录页出现 `mhub_session` Cookie 后返回 `{ cookie }`。插件保存完整 Cookie 字符串，
账号和同步请求都发送 `Cookie: mhub_session=…` 与 `x-mhub-client: 1`。

`GET /api/v1/auth/me` 返回：

```json
{
  "user": {
    "id": 36,
    "username": "lemon",
    "device_id": "a90725c5-5e49-4745-a854-687dcf47599c",
    "has_password": true,
    "passkeys": 1
  }
}
```

`user` 为 `null` 表示未登录或会话已失效。插件把账号映射为 `{ id, name, imageUrl }`，其中 `name`
取 `username`，`imageUrl` 固定使用 MHub 的 `apple-touch-icon.png`。账号接口返回 `401` 时清除本地
`cookie` 和 `account`，抛出 `signIn` 让用户重新登录。

`POST /api/v1/auth/logout` 请求体为 `{}`，无论成功与否插件都会清除本地会话和当前账号的本地歌单文档。

### Passkey

网页版的通行密钥流程是 `POST /api/v1/auth/passkey/login/start`，响应包含
`rpId: "music.op.wiki"`、空 `allowCredentials` 和 `userVerification: "required"`，属于
discoverable credential。

插件无法使用 passkey：MyGo 的 `webSignIn` 使用 WKWebView，最小 WKWebView 实测
`PublicKeyCredential` 存在，但 `isUserVerifyingPlatformAuthenticatorAvailable()` 为 `false`；
插件运行时也没有 `navigator.credentials`。账号有 passkey 时仍需在登录页使用密码或恢复码。

### 歌单文档

歌单保存在一个 Yjs 文档里，`/api/v1/sync/library` 交换 base64 编码的增量：

```http
POST /api/v1/sync/library
Content-Type: application/json
Cookie: mhub_session=…
x-mhub-client: 1

{
  "state_vector": "AA==",
  "update": "AAA="
}
```

```json
{
  "update": "AAA=",
  "state_vector": "AA=="
}
```

- `state_vector` 是客户端当前状态向量，`update` 是相对上次服务端状态向量的增量。
- 空文档的状态向量是 `AA==`，增量是 `AAA=`；传空字符串会得到 `400 {"detail":"同步状态无效"}`。
- 响应 `update` 应用到本地文档，响应的 `state_vector` 作为下一次的基准。
- 本地按账号保存 `library:<accountId>`，内容是文档全量 update 与服务端 state vector 的 base64。

文档结构：

| 顶层 | 类型 | 内容 |
| --- | --- | --- |
| `playlists` | `Y.Map` | 键为歌单 ID，值为包含 `name`、`cover`、`created_at`、`updated_at` 和 `order` 的 `Y.Map` |
| `tracks` | `Y.Map` | 键为 `platform:source_id`，值为 `{platform, source_id, title, artist, cover}` |
| `taste` | `Y.Map` | `liked`、`less` 两个 `Y.Array`；插件只读 |

`playlists` 的 `order` 是 `Y.Array`，保存 `tracks` 的键。插件创建、改名、删除歌单以及加歌、删歌、
移动歌曲都会先修改文档，然后立即以 `force` 同步；读取歌单和打开歌单最多每 5 秒同步一次。

## 搜索

```http
GET /api/v1/search?platform=applemusic&q=晴天&limit=20
```

| 参数 | 说明 |
| --- | --- |
| `platform` | 平台 ID 或别名；插件使用设置中的平台，默认 `applemusic` |
| `q` | 关键词、歌曲链接或平台内 ID |
| `limit` | 服务端钳制到 `1..20`，默认 10 |

响应是 `SearchItem` 数组：

```json
[
  {
    "platform": "applemusic",
    "id": "535824738",
    "song": "晴天",
    "singer": "周杰伦",
    "cover": "https://is1-ssl.mzstatic.com/.../110x110bb.webp"
  }
]
```

搜索结果没有专辑、时长和音质信息。插件把 `cover` 用作 `Track.album.imageUrl`；`song` 作为曲名，
`singer` 作为歌手。

`suggest` 复用同一接口，`limit=6`，返回去重后的 `song`。

## 推荐

```http
GET /api/v1/recommendations?platform=applemusic&limit=20
GET /api/v1/recommendations?platform=applemusic&limit=1
```

| 调用 | 参数 |
| --- | --- |
| 电台种子 | `limit=1` |
| 电台兜底 | `limit=20` |

`limit` 被服务端钳制到 `1..50`，`exclude` 最多采用 500 个数字 ID。推荐是服务端共享来源，不按用户身份生成。
返回 `SearchItem` 数组，实际数量可能少于 `limit`。首页和发现页都不请求这个接口。

### 首页

```http
GET /api/v1/recommendations/home?limit=12
```

响应：

```json
{
  "source": "applemusic-personal",
  "tags": [
    {
      "id": "selection-1",
      "label": "为你精选",
      "subtitle": "",
      "playlist_ids": ["pl.pm-..."]
    }
  ],
  "playlists": [
    {
      "id": "pl.pm-...",
      "resource_type": "playlists",
      "name": "音乐新发现",
      "curator": "Apple Music",
      "description": "",
      "cover": "https://is1-ssl.mzstatic.com/.../720x720cc.jpg",
      "url": "https://music.apple.com/cn/playlist/pl.pm-...",
      "recommendation_id": "selection-1"
    }
  ],
  "tracks": [{ "platform": "applemusic", "id": "535824738", "song": "晴天", "singer": "周杰伦" }]
}
```

插件按 `tags` 顺序生成栏目：标签作为栏目标题，`playlist_ids` 在 `playlists` 中查找对应资源，
`resource_type` 决定卡片类型：

- `playlists` → `Playlist` 卡片，`id` 为 `pl:<url>`。
- `albums` → `Album` 卡片，`id` 为 `al:<url>`。

`tracks` 作为「推荐歌曲」栏目放在最后。最近播放来自本地存储，排在栏目最前面。

### 发现页的 Apple Music 板块

发现页的「大家都在听」「每周热门 100 首」「城市排行榜」来自 Apple Music `/new` 页面里的
`serialized-server-data` JSON：

```http
GET https://music.apple.com/cn/new
```

插件按 shelf ID 取三个板块：

| 板块 | shelf ID |
| --- | --- |
| 大家都在听 | `6831386381` |
| 每周热门 100 首 | `6505052377` |
| 城市排行榜 | `6504784714` |

`contentDescriptor.kind` 为 `playlist` 或 `album` 的条目转成卡片，电台条目跳过。卡片 ID 为
`pl:<Apple URL>` 或 `al:<Apple URL>`，打开时仍通过 `/api/v1/collections/resolve` 解析。

`/collections/resolve` 不支持 `/room/<id>` 链接，直接传 room URL 会返回
`400 该平台暂不支持此歌单链接`；单个 `pl.*` 歌单和 `album:数字ID` 可以正常解析。

解析结果缓存 30 分钟。Apple 页面请求失败时，发现页返回空栏目。

MHub 返回的 `playlist.cover`、`album.cover` 会套用 `{size}` 占位符。Apple `/new` 的榜单图是
4:1 横幅且带文字，插件固定按 `1080x1080bb` 取图，避免应用按列表尺寸请求后文字发虚。

### 续播

```http
POST /api/v1/recommendations/continue
Content-Type: application/json

{
  "platform": "applemusic",
  "seed_id": "535824738",
  "exclude": ["535824738", "536009642"],
  "limit": 20
}
```

- `seed_id` 必须是 Apple Music 数字 ID，长度 `1..20` 且不能全为 0。
- `exclude` 为已播放或队列中的数字 ID，最多采用 10000 个；插件传入本机最多 1000 个。
- 返回 `{ "source": "...", "tracks": [SearchItem] }`。
- 上游失败且没有候选时返回 `503`；候选耗尽时 `tracks` 可为空。

插件只把最近播放中 `applemusic` 的数字 ID 作为种子。没有种子时先取一首推荐歌曲；续播失败或为空时退回
`/recommendations?limit=20`。

## 歌单与专辑

```http
GET /api/v1/collections/resolve?platform=applemusic&url=https%3A%2F%2Fmusic.apple.com%2Fcn%2Fplaylist%2F...
```

| 参数 | 说明 |
| --- | --- |
| `platform` | 平台 ID 或别名；插件按 URL 主机名推断，无法推断时使用搜索平台 |
| `url` | 歌单、专辑或集合链接，也接受部分平台的集合 ID |
| `limit` | 省略时完整解析，最多 5000 首；插件省略 |

响应：

```json
{
  "platform": "applemusic",
  "id": "pl.pm-...",
  "title": "音乐新发现",
  "source_url": "https://music.apple.com/cn/playlist/pl.pm-...",
  "items": [SearchItem]
}
```

插件用 `title` 作为歌单或专辑名，`items` 作为曲目；专辑曲目会额外带上 `album` 名和 `al:<url>`，
使应用内点击专辑可以继续打开。

歌单详情里 `cover` 不在该响应中，插件改用第一首曲目的封面。

## 歌词

```http
GET /api/v1/lyrics?platform=applemusic&track_id=535824738&title=晴天&artist=周杰伦&album=叶惠美&duration=269
```

| 参数 | 说明 |
| --- | --- |
| `platform` | 平台 ID |
| `track_id` | 平台曲目 ID 或歌曲链接 |
| `title` / `artist` / `album` | 可选；传入后启用网易云、QQ、酷狗、酷我的多源匹配与翻译对齐 |
| `duration` | 可选，单位秒 |

响应：

```json
{
  "platform": "applemusic",
  "track_id": "535824738",
  "available": true,
  "plain": "[00:29.18]故事的小黄花",
  "translation": ""
}
```

插件把 `plain` 作为 `lrc`，`translation` 非空时一并返回；`available=false` 或 `plain` 为空时抛出
`unavailable`，提示没有歌词。曲名、歌手等元数据来自本次会话的搜索或播放结果。

## 播放

播放分三步：创建任务、轮询状态、探测并返回媒体地址。

### 创建任务

```http
POST /api/v1/playbacks
Content-Type: application/json

{
  "platform": "applemusic",
  "query": "535824738",
  "selected_id": "535824738",
  "quality": "high",
  "include_cover": true
}
```

- `query` 必填，即使已经提供 `selected_id`；插件直接使用曲目 ID 作为 `query`。
- `selected_id` 跳过关键词选曲。
- `quality` 为 `standard`、`high`、`lossless` 或 `hires`。插件始终使用应用传入的 `quality`；
  没有传入或值非法时用 `high`。
- `include_cover` 显式传 `true`。
- 省略 `streaming_mode`，因此不会请求 WASM ALAC 分包流。

响应状态：

- `200`：任务已经 `completed`，通常为缓存命中或复用。
- `202`：任务已接受，状态可能为 `queued`、`processing` 或 `streaming`。

响应字段：

```json
{
  "playback": { "id": "applemusic--535824738--high", "status": "queued", "...": "..." },
  "status_url": "/api/v1/playbacks/applemusic--535824738--high",
  "audio_url": "/api/v1/playbacks/applemusic--535824738--high/audio?rev=...",
  "cover_url": "/api/v1/playbacks/applemusic--535824738--high/cover",
  "lyrics_url": "/api/v1/playbacks/applemusic--535824738--high/lyrics"
}
```

### 轮询状态

```http
GET /api/v1/playbacks/{id}
```

插件从 `status_url` 读取，初始间隔 0.8 秒，按 1.4 倍退避，最长 3 秒，总超时 90 秒：

- `completed`：进入音频探测。
- `failed`：停止轮询，使用 `error` 作为错误信息。
- `queued` / `processing` / `streaming`：继续轮询。

普通下载必须等到 `completed`，不能把 `streaming` 当作完整文件。

### 音频探测与下载

任务完成后，插件对 `audio_url`（可能是 `music.zr.wiki` 的绝对 URL）发送 `HEAD`：

- `Content-Type` 决定 `stream.type`。
- `Content-Length` 决定 `stream.size`。

这一步是必要的：`playback.format` 和 `content_type` 是源音频元数据，实际文件可能是兼容格式。例如
无损任务元数据为 `m4a`，实际响应为 `audio/flac`。

探测失败时退回任务元数据。最终由应用对返回的 `audio_url` 发起下载或 Range 播放，`rev` 必须保留。

## 字段映射

| MHub | MyGo |
| --- | --- |
| `SearchItem.id` + `platform` | `Track.id = platform:id` |
| `SearchItem.song` | `Track.name` |
| `SearchItem.singer` | `Track.artists[].name` |
| `SearchItem.cover` | `Track.album.imageUrl` |
| `PlaybackTask.duration`（秒） | `Track.duration`（毫秒） |
| `PlaybackTask.album` | `Track.album.name` |
| `PlaybackTask.audio_url` | `stream.url` |
| `PlaybackTask.byte_size` | `stream.size` 的兜底值 |
| `RecommendationPlaylist` | `Playlist` 或 `Album` 卡片 |
| `CollectionResponse` | `Playlist` / `Album` 详情与 `tracks` |
| `LyricsResponse.plain` | `lyrics.lrc` |
| `LyricsResponse.translation` | `lyrics.translation` |

### 插件 ID

| 对象 | 格式 | 示例 |
| --- | --- | --- |
| 曲目 | `<platform>:<trackId>` | `applemusic:535824738` |
| 歌单 | `pl:<url>` | `pl:https://music.apple.com/cn/playlist/...` |
| 专辑 | `al:<url>` | `al:https://music.apple.com/cn/album/1808448643` |
| 电台 | `continue` | `continue` |

歌单和专辑 ID 直接携带解析链接，`playlist` / `album` / `browse` 再次调用
`/collections/resolve` 即可。

### 图片占位符

插件把已知能缩放的封面转换成 `{size}`：

- Apple Music：`/110x110bb.webp` → `/{size}x{size}bb.webp`
- 网易云：追加 `?param={size}y{size}` 或 `&param={size}y{size}`
- YouTube Music：`=w120-h120-l90-rj` → `=w{size}-h{size}-l90-rj`

无法识别的主机保持原样。

## 错误处理

| 状态 | 形态 | 插件行为 |
| --- | --- | --- |
| `400` | JSON `detail`，参数解析错误可能为纯文本 | 直接显示 `detail` 或响应文本 |
| `401` | JSON `detail` | 清除会话与本地歌单，提示重新登录 |
| `404` | JSON，任务或文件不存在 | 显示错误；播放任务可能需要重新创建 |
| `409` | JSON，音频或封面尚未就绪 | 显示错误 |
| `413` / `415` / `422` | 通常为纯文本 | 显示截断后的响应文本 |
| `500` | JSON `detail` | 显示错误 |
| `502` | JSON，媒体上游不可用 | 显示错误 |
| `503` | JSON，续播无候选 | 电台改用普通推荐 |

网络层失败抛出 `unavailable`，并附带「无法连接音乐服务」提示。

## 调用时序

首页：

```text
GET /recommendations/home?limit=12
  → Recently played（本机） + tags 栏目 + 推荐歌曲
```

发现页：

```text
GET https://music.apple.com/cn/new
  → 大家都在听 + 每周热门 100 首 + 城市排行榜
```

播放：

```text
POST /playbacks
  → 200 completed ─┐
  → 202 ─→ GET status_url 轮询 ─→ completed
                              └→ failed
  → HEAD audio_url（Content-Type / Content-Length）
  → 返回 { url, type, size, quality }
```

打开歌单/专辑：

```text
GET /collections/resolve?platform=&url=
  → playlist({ id }) / album({ id }) / browse({ page: "pl:..." | "al:..." })
```

## 平台可用性

测试于 2026-11-08：

| 平台 | 搜索 | 播放 |
| --- | --- | --- |
| `applemusic` | 可用 | 可用，`lossless` 已验证 |
| `netease` | 可用 | 可用 |
| `bilibili` | 可用 | 可用 |
| `youtubemusic` | 可用 | 可用 |
| `tencent` | 可用 | 当前直链获取被风控（`vkeys ... 账号被风控`） |
| `kugou` | 不可用 | 服务端提示「酷狗音乐已下线」 |
| `soda` | 不可用 | 服务端提示「汽水音乐已下线」 |

平台状态由服务端决定，插件不内置降级平台列表；搜索平台可在插件设置中修改。
