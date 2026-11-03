import { assertEditorPost } from "@/lib/x/guard";
import { issueTicket } from "@/lib/x/ticket";

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { text?: unknown; claimId?: unknown; checks?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const ticket = issueTicket(body);
  if (!ticket.ok) return Response.json({ ok: false, message: ticket.message }, { status: 400, headers: { "cache-control": "no-store" } });
  return Response.json(
    { ok: true },
    { status: 200, headers: { "cache-control": "no-store", "set-cookie": ticket.cookie } },
  );
}
