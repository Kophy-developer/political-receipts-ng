import { assertEditorPost, reservePostNonce } from "@/lib/x/guard";
import { publishApprovedPost, validateApprovedPost } from "@/lib/x/publish";
import { takeTicket } from "@/lib/x/ticket";

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { text?: unknown; claimId?: unknown; checks?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const problem = validateApprovedPost(body, true);
  if (problem) return Response.json({ ok: false, message: problem }, { status: 400, headers: { "cache-control": "no-store" } });
  const ticket = takeTicket(request, body.claimId as string, body.text as string);
  if (!ticket.ok) {
    return Response.json({ ok: false, message: ticket.message }, { status: 409, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } });
  }
  if (!reservePostNonce(ticket.nonce)) {
    return Response.json(
      { ok: false, message: "This confirmation was already used. Open it again before sending." },
      { status: 409, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
    );
  }
  const posted = await publishApprovedPost(body.text as string);
  if (!posted.ok) {
    return Response.json(
      { ok: false, message: posted.message },
      { status: posted.status === 503 ? 503 : 502, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
    );
  }
  return Response.json(
    {
      ok: true,
      id: posted.id,
      url: posted.url,
      retained: false,
    },
    { status: 200, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
  );
}
