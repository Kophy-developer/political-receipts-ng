import { planDraftProviders } from "@/lib/ai/catalog";
import { readAiEnv } from "@/lib/ai/runtime";
import { callProvider } from "@/lib/ai/transport";
import { calledToday, persistAttempts } from "@/lib/db/ai-attempts";
import { getClaim } from "@/lib/db/claims";
import { loadClaimDrafts, saveClaimDraft, selectClaimDraft, storeEditorDraft, storeGeneratedDrafts } from "@/lib/db/drafting";
import { isUuid } from "@/lib/db/labels";
import { draftWithProviders } from "@/lib/drafts/chain";
import { appendSourcePost, DRAFT_UNAVAILABLE, draftBriefFrom, judgeEditorText, judgeSavedText, type GeneratedStyle } from "@/lib/drafts/rules";
import { draftUnlocked } from "@/lib/research/editor-review";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 60;

const generated = new Set<GeneratedStyle>(["conversational", "punchy", "analytical", "thread"]);
const running = new Set<string>();

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { claimId?: unknown; action?: unknown; style?: unknown; draftId?: unknown; content?: unknown; sources?: unknown };
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
      const sources = typeof body.sources === "string" ? body.sources : "";
      const attached = appendSourcePost(content, sources);
      if (!attached.ok) return Response.json({ ok: false, message: attached.reason }, { status: 400 });
      const judged = judgeSavedText(current.style, attached.text, hashtagAlreadyUsed);
      if (!judged.ok) return Response.json({ ok: false, message: judged.reason }, { status: 400 });
      const saved = await saveClaimDraft({ claimId, draftId, piece: judged.draft, angle: brief.angleTitle, verdict: brief.verdict });
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
    const existing = await loadClaimDrafts(claimId);
    const hashtagAlreadyUsed = existing.some((item) => item.hashtag === "#CheckAm");
    const used = await calledToday();
    const result = await draftWithProviders({
      requestId: crypto.randomUUID(),
      task: action === "regenerate" ? "draft_regenerate" : "draft",
      brief,
      style: action === "regenerate" ? (style as GeneratedStyle) : undefined,
      hashtagAlreadyUsed,
      plans: planDraftProviders(readAiEnv(), used),
      timeoutMs: 18_000,
      call: (plan, request) => callProvider(plan, request),
    });
    await persistAttempts(result.attempts);
    if (result.outcome === "unavailable") {
      return Response.json({ ok: false, unavailable: true, rejected: false, message: DRAFT_UNAVAILABLE, problems: result.problems });
    }
    if (result.outcome === "rejected") {
      return Response.json({ ok: false, unavailable: false, rejected: true, message: result.message, problems: result.problems });
    }
    if (result.provider && result.drafts.length) {
      const stored = await storeGeneratedDrafts(claimId, result.drafts, { provider: result.provider, model: result.model });
      if (!stored.ok) return Response.json({ ok: false, message: stored.message }, { status: 400 });
    }
    return Response.json({
      ok: result.outcome === "saved",
      unavailable: false,
      rejected: false,
      message: result.message,
      problems: result.problems,
    });
  } finally {
    running.delete(claimId);
  }
}
