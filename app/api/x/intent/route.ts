import { createApproval } from "@/lib/db/approvals";
import { loadStoredCapability } from "@/lib/db/connections";
import { assertEditorRequest } from "@/lib/x/guard";
import { validatePublishRequest } from "@/lib/x/publish";
import { issueTicket } from "@/lib/x/ticket";

export async function POST(request: Request) {
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { text?: unknown; claimId?: unknown; draftId?: unknown; checks?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const capability = await loadStoredCapability();
  const problem = validatePublishRequest(body, false, capability);
  if (problem) return Response.json({ ok: false, message: problem }, { status: 400, headers: { "cache-control": "no-store" } });
  const approval = await createApproval({
    draftId: body.draftId as string,
    claimId: body.claimId as string,
    text: body.text as string,
    checks: body.checks,
  });
  if (!approval.ok) {
    return Response.json({ ok: false, message: approval.message }, { status: approval.status, headers: { "cache-control": "no-store" } });
  }
  const ticket = issueTicket(approval.approvalId, body.text as string);
  if (!ticket.ok) return Response.json({ ok: false, message: ticket.message }, { status: 400, headers: { "cache-control": "no-store" } });
  return Response.json(
    { ok: true, approvalId: approval.approvalId },
    { status: 200, headers: { "cache-control": "no-store", "set-cookie": ticket.cookie } },
  );
}
