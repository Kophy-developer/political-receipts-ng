import { verifyOauth1Account } from "@/lib/x/account";
import { credentialFlags } from "@/lib/x/env";
import { assertEditorPost, reserveAccountRead } from "@/lib/x/guard";
import { openSeal, readCookie, seal, writeCookie } from "@/lib/x/seal";

type CheckCookie = { at: number };

function json(body: object, status = 200, cookie?: string) {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return json({ ok: false, message: refused }, 403);
  if (!credentialFlags().oauth1) {
    return json({ ok: false, connected: false, message: "X API credentials are not configured on the server." }, 503);
  }
  const previous = openSeal<CheckCookie>(readCookie(request.headers.get("cookie"), "prng_x_check"));
  const wait = reserveAccountRead(previous?.at ?? null);
  if (wait) return json({ ok: false, message: wait }, 429);
  const result = await verifyOauth1Account();
  const stamp = seal({ at: Date.now() } satisfies CheckCookie);
  const cookie = stamp ? writeCookie("prng_x_check", stamp, "/api/x", 60) : undefined;
  if (!result.ok) return json({ ok: false, connected: false, message: result.message }, result.status >= 400 ? result.status : 502, cookie);
  return json(
    {
      ok: true,
      connected: true,
      username: result.account.username,
      name: result.account.name,
      method: "OAuth 1.0a user context",
      read: true,
      write: "not_exercised",
      checkedAt: new Date().toISOString(),
    },
    200,
    cookie,
  );
}
