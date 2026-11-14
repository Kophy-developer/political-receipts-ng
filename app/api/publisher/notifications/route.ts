import { connection } from "next/server";
import { listUnreadReadyNotifications, markReadyNotificationsRead } from "@/lib/db/notifications";
import { assertEditorRequest } from "@/lib/x/guard";

export async function GET() {
  await connection();
  const unread = await listUnreadReadyNotifications();
  return Response.json({
    ok: true,
    count: unread.count,
    items: unread.items,
    installed: unread.installed,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { opportunityId?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    body = { all: true };
  }
  const marked = await markReadyNotificationsRead({
    opportunityId: typeof body.opportunityId === "string" ? body.opportunityId : undefined,
  });
  return Response.json(marked, { status: marked.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
