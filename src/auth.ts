import { authRequest, clearSession, cookieHeader } from "./api.js";
import { AVATAR, BASE } from "./constants.js";
import type { Account, MHubAuthMeResponse } from "./types.js";
import { tr } from "./utils.js";

export async function account(): Promise<Account | null> {
  if (!cookieHeader()) return null;
  let data: MHubAuthMeResponse;
  try {
    data = await authRequest<MHubAuthMeResponse>("/api/v1/auth/me");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "signIn") {
      return null;
    }
    throw error;
  }
  if (!data.user) {
    clearSession();
    return null;
  }
  const me: Account = {
    id: String(data.user.id),
    name: String(data.user.username || ""),
    imageUrl: AVATAR,
  };
  host.storage.set("account", me);
  return me;
}

export async function signIn(): Promise<Account> {
  const result = await host.webSignIn({
    url: BASE + "/",
    cookiesOf: BASE + "/",
    until: ["mhub_session"],
  });
  host.storage.set("cookie", result.cookie);
  const me = await account();
  if (!me) {
    clearSession();
    throw new Error(tr("MHub didn't accept that sign-in. Try again."));
  }
  return me;
}

export async function signOut(): Promise<void> {
  if (cookieHeader()) {
    try {
      await authRequest("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch (error) {
      console.warn("MHub sign out: " + (error instanceof Error ? error.message : ""));
    }
  }
  clearSession();
}
