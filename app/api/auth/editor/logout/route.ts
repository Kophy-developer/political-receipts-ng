import { sessionCookie } from "@/lib/auth/token";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true, message: "Signed out." },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "set-cookie": `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
      },
    },
  );
}
