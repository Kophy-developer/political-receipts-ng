import { geminiJson } from "@/lib/ai/gemini";
import { getClaim } from "@/lib/db/claims";
import { loadClaimDrafts, saveClaimDraft, selectClaimDraft, storeEditorDraft, storeGeneratedDrafts } from "@/lib/db/drafting";
import { isUuid } from "@/lib/db/labels";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { DRAFT_UNAVAILABLE, draftBriefFrom, judgeEditorText, judgeSavedText, type GeneratedStyle } from "@/lib/drafts/rules";
import { requestDraftSet, requestOneStyle, type DraftModel } from "@/lib/drafts/run";
import { lagosDayStart, scanLimits } from "@/lib/intel/limits";
import { draftUnlocked } from "@/lib/research/editor-review";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 30;

const generated = new Set<GeneratedStyle>(["conversational", "punchy", "analytical", "thread"]);
const running = new Set<string>();

function model(): DraftModel {
  return async (input) => {
    const result = await geminiJson(input);
    return { ok: result.ok, called: result.called, data: result.ok ? result.data : undefined, message: result.ok ? undefined : result.message };
  };
}

async function allowance() {
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return 0;
  return Math.max(0, scanLimits.dailyGeminiRequests - usage.totals.geminiRequests);
}

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { claimId?: unknown; action?: unknown; style?: unknown; draftId?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const claimId = typeof body.claimId === "string" ? body.claimId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!isUuid(claimId)) return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 400 });
  const loaded = await getClaim(claimId);
  if (!loaded.ok || !loaded.claim) return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 400 });
  const claim = loaded.claim;
  const gate = draftUnlocked({ recordedAt: claim.verdictRecordedAt, angle: claim.editorAngle, angleText: claim.editorAngleText });
  if (!gate.open) return Response.json({ ok: false, message: gate.reason }, { status: 400 });
  const brief = draftBriefFrom({
    claim: claim.claim,
    postText: claim.postText,
    verdict: claim.proposedVerdict,
    confidence: claim.verdictConfidence,
    angle: claim.editorAngle,
    take: claim.editorTake,
    review: claim.editorReview,
  });
  if (!brief) return Response.json({ ok: false, message: "This claim is not ready for a draft." }, { status: 400 });

  if (action === "manual" || action === "save") {
    const content = typeof body.content === "string" ? body.content : "";
    const existing = await loadClaimDrafts(claimId);
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    const current = existing.find((item) => item.id === draftId);
    const hashtagAlreadyUsed = existing.some((item) => item.hashtag === "#CheckAm" && item.id !== draftId);
    if (action === "save") {
      if (!current) return Response.json({ ok: false, message: "Choose a draft to save." }, { status: 400 });
      const judged = judgeSavedText(current.style, content, hashtagAlreadyUsed);
      if (!judged.ok) return Response.json({ ok: false, message: judged.reason }, { status: 400 });
      const saved = await saveClaimDraft({ claimId, draftId, piece: judged.draft });
      if (!saved.ok) return Response.json({ ok: false, message: saved.message }, { status: 400 });
      return Response.json({ ok: true, message: "Draft saved. It was not published." });
    }
    const judged = judgeEditorText(content, hashtagAlreadyUsed);
    if (!judged.ok) return Response.json({ ok: false, message: judged.reason }, { status: 400 });
    const saved = await storeEditorDraft(claimId, judged.draft);
    if (!saved.ok) return Response.json({ ok: false, message: saved.message }, { status: 400 });
    return Response.json({ ok: true, message: "Your version is saved. It was not published." });
  }

  if (action === "select") {
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    if (!isUuid(draftId)) return Response.json({ ok: false, message: "Choose a draft." }, { status: 400 });
    const selected = await selectClaimDraft(claimId, draftId);
    if (!selected.ok) return Response.json({ ok: false, message: selected.message }, { status: 400 });
    return Response.json({ ok: true, message: "Draft selected. It was not published." });
  }

  if (action !== "create" && action !== "regenerate") {
    return Response.json({ ok: false, message: "That draft action is not available." }, { status: 400 });
  }
  const style = typeof body.style === "string" && generated.has(body.style as GeneratedStyle) ? (body.style as GeneratedStyle) : null;
  if (action === "regenerate" && !style) {
    return Response.json({ ok: false, message: "Choose a style to regenerate." }, { status: 400 });
  }
  if (running.has(claimId)) {
    return Response.json({ ok: false, message: "A draft request is already running. It was not sent again." }, { status: 409 });
  }
  running.add(claimId);
  try {
    const left = await allowance();
    const existing = await loadClaimDrafts(claimId);
    const hashtagAlreadyUsed = existing.some((item) => item.hashtag === "#CheckAm");
    const result = action === "regenerate"
      ? await requestOneStyle({
          allowance: left,
          brief,
          style: style as GeneratedStyle,
          hashtagAlreadyUsed,
          model: model(),
        })
      : await requestDraftSet({ allowance: left, brief, model: model() });
    if (result.called) {
      await recordUsage({ provider: "gemini", operation: "draft", requests: 1, units: 1 });
    }
    if (result.unavailable) {
      return Response.json({ ok: false, unavailable: true, message: DRAFT_UNAVAILABLE, problems: result.problems });
    }
    if (result.drafts.length) {
      const stored = await storeGeneratedDrafts(claimId, result.drafts, "gemini");
      if (!stored.ok) return Response.json({ ok: false, message: stored.message }, { status: 400 });
    }
    return Response.json({
      ok: result.drafts.length > 0,
      unavailable: false,
      message: result.message,
      problems: result.problems,
    });
  } finally {
    running.delete(claimId);
  }
}
