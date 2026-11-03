import { readActiveApproval } from "@/lib/db/approvals";
import { failPublication, finishPublication, reservePublication } from "@/lib/db/publishing";
import { assertEditorPost, reservePostNonce } from "@/lib/x/guard";
import { publishApprovedPost, validatePublishRequest } from "@/lib/x/publish";
import { takeTicket } from "@/lib/x/ticket";

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { text?: unknown; claimId?: unknown; draftId?: unknown; approvalId?: unknown; checks?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const problem = validatePublishRequest(body, true);
  if (problem) return Response.json({ ok: false, message: problem }, { status: 400, headers: { "cache-control": "no-store" } });
  const ticket = takeTicket(request, body.approvalId as string, body.text as string);
  if (!ticket.ok) {
    return Response.json({ ok: false, message: ticket.message }, { status: 409, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } });
  }
  if (!reservePostNonce(ticket.nonce)) {
    return Response.json(
      { ok: false, message: "This confirmation was already used. Open it again before sending." },
      { status: 409, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
    );
  }
  const approval = await readActiveApproval(body.approvalId as string, body.text as string);
  if (!approval.ok) {
    return Response.json({ ok: false, message: approval.message }, { status: approval.status, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } });
  }
  if (approval.claimId !== body.claimId || approval.draftId !== body.draftId) {
    return Response.json(
      { ok: false, message: "The approval does not match this draft." },
      { status: 400, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
    );
  }
  const reserved = await reservePublication(approval.approvalId, approval.draftId);
  if (!reserved.ok) {
    return Response.json({ ok: false, message: reserved.message }, { status: reserved.status, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } });
  }
  const posted = await publishApprovedPost(body.text as string);
  if (!posted.ok) {
    await failPublication(reserved.id, approval.approvalId);
    return Response.json(
      { ok: false, message: posted.message },
      { status: posted.status === 503 ? 503 : 502, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
    );
  }
  const stored = await finishPublication({
    rowId: reserved.id,
    approvalId: approval.approvalId,
    xPostId: posted.id,
    xPostUrl: posted.url,
  });
  return Response.json(
    {
      ok: true,
      id: posted.id,
      url: posted.url,
      retained: stored.ok,
    },
    { status: 200, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
  );
}
