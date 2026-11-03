import "server-only";
import { xUserRequest } from "@/lib/x/oauth1";
import { scrubPublicMessage } from "@/lib/x/scrub";

const meUrl = "https://api.twitter.com/2/users/me?user.fields=name,username";

export type XAccount = {
  username: string;
  name: string;
};

function accountFrom(data: unknown): XAccount | null {
  if (!data || typeof data !== "object") return null;
  const row = (data as { data?: { username?: unknown; name?: unknown } }).data;
  if (!row || typeof row.username !== "string" || typeof row.name !== "string") return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(row.username)) return null;
  if (!row.name.trim() || row.name.length > 80) return null;
  return { username: row.username, name: row.name.trim() };
}

export async function verifyOauth1Account() {
  const result = await xUserRequest("GET", meUrl);
  if (!result.ok) return result;
  const account = accountFrom(result.data);
  if (!account) return { ok: false as const, status: 502, message: "X did not return an account profile." };
  return { ok: true as const, account };
}

export async function identifyBearer(accessToken: string) {
  let response: Response;
  try {
    response = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false as const, message: "The desk could not reach X." };
  }
  if (!response.ok) {
    return { ok: false as const, message: "X did not confirm the authorised account." };
  }
  try {
    const account = accountFrom(await response.json());
    if (!account) return { ok: false as const, message: "X did not return an account profile." };
    return { ok: true as const, account };
  } catch {
    return { ok: false as const, message: scrubPublicMessage("X returned a response the desk could not read.") };
  }
}
