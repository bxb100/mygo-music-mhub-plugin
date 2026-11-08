import { get, post, request } from "./api.js";
import { AUDIO_TYPES, TASK_TIMEOUT } from "./constants.js";
import type {
  LyricsResult,
  MHubLyricsResponse,
  MHubPlaybackResponse,
  MHubPlaybackTask,
  StreamResult,
} from "./types.js";
import { absolute, fail, level, meta, sleep, tr, unpack } from "./utils.js";

export function contentTypeOf(value?: string | null): string {
  const text = String(value || "").toLowerCase();
  if (text.indexOf("mpeg") !== -1) return "mp3";
  if (text.indexOf("mp4") !== -1 || text.indexOf("m4a") !== -1) return "m4a";
  if (text.indexOf("flac") !== -1) return "flac";
  if (text.indexOf("ogg") !== -1) return "ogg";
  if (text.indexOf("wav") !== -1) return "wav";
  if (text.indexOf("aac") !== -1) return "aac";
  return "";
}

export function typeOf(task: MHubPlaybackTask, url: string): string {
  const format = String(task.format || "").toLowerCase();
  if (format === "alac" || format === "mp4") return "m4a";
  if (AUDIO_TYPES.indexOf(format) !== -1) return format;
  const fromContentType = contentTypeOf(task.content_type);
  if (fromContentType) return fromContentType;
  const suffix =
    String(url || "")
      .split("?")[0]
      .split(".")
      .pop()
      ?.toLowerCase() || "";
  if (suffix === "alac") return "m4a";
  return AUDIO_TYPES.indexOf(suffix) === -1 ? "mp3" : suffix;
}

export async function probe(url: string): Promise<{ type: string; size: number } | null> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length"));
    return {
      type: contentTypeOf(response.headers.get("content-type")),
      size: Number.isFinite(length) ? length : 0,
    };
  } catch (error) {
    console.warn("MHub probe: " + (error instanceof Error ? error.message : ""));
    return null;
  }
}

export async function settle(task: MHubPlaybackTask, statusUrl?: string): Promise<MHubPlaybackTask> {
  if (task.status === "completed") return task;
  if (task.status === "failed") {
    throw fail("unavailable", task.error || tr("The service could not prepare this song."));
  }
  const url = absolute(statusUrl || "/api/v1/playbacks/" + task.id);
  const deadline = Date.now() + TASK_TIMEOUT;
  let delay = 800;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.4), 3000);
    const current = await request<MHubPlaybackTask>(url, {
      headers: { Accept: "application/json" },
    });
    if (current.status === "completed") return current;
    if (current.status === "failed") {
      throw fail("unavailable", current.error || tr("The service could not prepare this song."));
    }
  }
  throw fail("unavailable", tr("The service took too long to prepare this song."));
}

export function rememberTask(id: string, ref: { platform: string; trackId: string }, task: MHubPlaybackTask) {
  const previous = meta.get(id);
  meta.set(id, {
    platform: ref.platform,
    trackId: ref.trackId,
    title: task.title || previous?.title || "",
    artist: task.artist || previous?.artist || "",
    album: task.album || previous?.album || "",
    duration: task.duration || previous?.duration || 0,
    cover: previous?.cover || "",
  });
}

export async function lyrics({ id }: { id?: string }): Promise<LyricsResult> {
  const ref = unpack(id);
  const info = meta.get(String(id || ""));
  const data = await get<MHubLyricsResponse>("/api/v1/lyrics", {
    platform: ref.platform,
    track_id: ref.trackId,
    title: info?.title,
    artist: info?.artist,
    album: info?.album,
    duration: info?.duration ? Math.round(info.duration) : undefined,
  });
  if (!data.available || !data.plain) {
    throw fail("unavailable", tr("No lyrics for this song."));
  }
  const out: LyricsResult = { lrc: data.plain };
  if (data.translation) out.translation = data.translation;
  return out;
}

export async function stream({ id, quality }: { id?: string; quality?: string }): Promise<StreamResult> {
  const trackId = String(id || "");
  const ref = unpack(trackId);
  const wanted = level(quality);
  const created = await post<MHubPlaybackResponse>("/api/v1/playbacks", {
    platform: ref.platform,
    query: ref.trackId,
    selected_id: ref.trackId,
    quality: wanted,
    include_cover: true,
  });
  const task = await settle(created.playback, created.status_url);
  const url = absolute(task.audio_url || created.audio_url);
  if (!url) throw fail("unavailable", tr("The service did not return an audio file."));
  rememberTask(trackId, ref, task);
  const actual = await probe(url);
  const out: StreamResult = {
    url,
    type: (actual && actual.type) || typeOf(task, url),
    quality: wanted,
  };
  const size = (actual && actual.size) || task.byte_size;
  if (size) out.size = size;
  return out;
}
