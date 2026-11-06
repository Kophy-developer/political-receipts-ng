import { passwordsMatch } from "@/lib/auth/password";
import { sessionCookie, sessionTtlMs, signSession } from "@/lib/auth/token";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  const password = process.env.EDITOR_PASSWORD?.trim() ?? "";
  const secret = process.env.EDITOR_SESSION_SECRET?.trim() ?? "";
  if (!password || !secret) {
    return Response.json({ ok: false, message: "Editor sign-in is not configured." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.password !== "string" || !passwordsMatch(password, body.password)) {
    return Response.json({ ok: false, message: "That password does not match." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const token = await signSession(secret, Date.now() + sessionTtlMs);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true, message: "Signed in." },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "set-cookie": `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}${secure}`,
      },
    },
  );
}
