import { readActiveApproval } from "@/lib/db/approvals";
import { loadStoredCapability } from "@/lib/db/connections";
import { failPublication, finishPublication, reservePublication } from "@/lib/db/publishing";
import { claimPublishConfirmation } from "@/lib/db/confirmations";
import { markPublishedOpportunity } from "@/lib/db/publisher";
import { assertEditorRequest } from "@/lib/x/guard";
import { publishApprovedPost, validatePublishRequest } from "@/lib/x/publish";
import { takeTicket } from "@/lib/x/ticket";

export async function POST(request: Request) {
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { text?: unknown; claimId?: unknown; draftId?: unknown; approvalId?: unknown; checks?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const capability = await loadStoredCapability();
  const problem = validatePublishRequest(body, true, capability);
  if (problem) return Response.json({ ok: false, message: problem }, { status: 400, headers: { "cache-control": "no-store" } });
  const ticket = takeTicket(request, body.approvalId as string, body.text as string);
  if (!ticket.ok) {
    return Response.json({ ok: false, message: ticket.message }, { status: 409, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } });
  }
  const claimed = await claimPublishConfirmation(ticket.nonce, body.approvalId as string);
  if (!claimed.ok) {
    return Response.json(
      { ok: false, message: claimed.message },
      { status: claimed.status, headers: { "cache-control": "no-store", "set-cookie": ticket.clear } },
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
    text: body.text as string,
  });
  await markPublishedOpportunity(approval.claimId);
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
