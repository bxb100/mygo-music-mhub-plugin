export const BASE = "https://music.op.wiki";
export const TASK_TIMEOUT = 90 * 1000;
export const SEARCH_LIMIT = 20;
export const RECENT_MAX = 100;
export const RADIO_MAX = 300;
export const SYNC_INTERVAL = 5000;
export const APPLE_NEW_URL = "https://music.apple.com/cn/new";
export const APPLE_NEW_TTL = 30 * 60 * 1000;
export const AUDIO_TYPES = ["mp3", "flac", "ogg", "wav", "m4a", "aac"];
export const QUALITIES = ["standard", "high", "lossless", "hires"];
export const AVATAR = "https://music.op.wiki/icons/apple-touch-icon.png";

export const ALIASES: Record<string, string> = {
  am: "applemusic",
  apple: "applemusic",
  "apple-music": "applemusic",
  apple_music: "applemusic",
  苹果音乐: "applemusic",
  qq: "tencent",
  qqmusic: "tencent",
  tx: "tencent",
  qq音乐: "tencent",
  腾讯音乐: "tencent",
  网易云: "netease",
  网易云音乐: "netease",
  b站: "bilibili",
  bili: "bilibili",
  yt: "youtubemusic",
  youtube: "youtubemusic",
  ytmusic: "youtubemusic",
};

export const PLATFORM_LABELS: Record<string, string> = {
  applemusic: "Apple Music",
  bilibili: "哔哩哔哩",
  kugou: "酷狗音乐",
  netease: "网易云音乐",
  soda: "汽水音乐",
  tencent: "QQ 音乐",
  youtubemusic: "YouTube Music",
};

export const HOSTS: [string, string][] = [
  ["music.apple.com", "applemusic"],
  ["music.163.com", "netease"],
  ["163cn.tv", "netease"],
  ["y.qq.com", "tencent"],
  ["qq.com", "tencent"],
  ["bilibili.com", "bilibili"],
  ["b23.tv", "bilibili"],
  ["music.youtube.com", "youtubemusic"],
  ["youtube.com", "youtubemusic"],
  ["kugou.com", "kugou"],
  ["qishui.douyin.com", "soda"],
];
