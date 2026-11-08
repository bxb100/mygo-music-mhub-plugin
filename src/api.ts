import { BASE } from "./constants.js";
import type { Account } from "./types.js";
import { fail, messageOf, queryOf, tr } from "./utils.js";

let onSessionClear: (() => void) | null = null;

export function registerSessionClear(handler: () => void) {
  onSessionClear = handler;
}

export function cookieHeader() {
  const value = host.storage.get("cookie");
  return typeof value === "string" ? value : "";
}

export function authHeaders(extra?: HeadersInit): Record<string, string> {
  const cookie = cookieHeader();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-mhub-client": "1",
    Cookie: cookie,
  };
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(extra)) {
      for (const [k, v] of extra) headers[k] = v;
    } else {
      Object.assign(headers, extra);
    }
  }
  return headers;
}

export async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw fail(
      "unavailable",
      tr("Can't reach the music service.") + " " + (error instanceof Error ? error.message : ""),
    );
  }
  const type = response.headers.get("content-type") || "";
  const body = type.indexOf("json") !== -1 ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(messageOf(body, response)) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export function get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>(BASE + path + queryOf(params), { headers: { Accept: "application/json" } });
}

export function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return request<T>(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

export function clearSession() {
  host.storage.remove("cookie");
  host.storage.remove("account");
  if (onSessionClear) onSessionClear();
}

export function currentAccount(): Account | null {
  const me = host.storage.get("account") as Account | null;
  return me && me.id ? me : null;
}

export function requireAccount(): Account {
  const me = currentAccount();
  if (!me) throw fail("signIn", tr("Sign in to MHub to sync playlists."));
  return me;
}

export async function authRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  if (!cookieHeader()) throw fail("signIn", tr("Sign in to MHub to sync playlists."));
  try {
    return await request<T>(BASE + path, {
      ...init,
      headers: authHeaders(init && init.headers),
    });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 401) {
      clearSession();
      throw fail("signIn", tr("Your MHub session expired. Sign in again."));
    }
    throw error;
  }
}
