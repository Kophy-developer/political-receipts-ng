import "server-only";
import { planDraftProviders } from "@/lib/ai/catalog";
import { readAiEnv } from "@/lib/ai/runtime";
import { callProvider } from "@/lib/ai/transport";
import { calledToday, persistAttempts } from "@/lib/db/ai-attempts";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { storeGeneratedDrafts } from "@/lib/db/drafting";
import { recordEvent } from "@/lib/db/events";
import { isUuid } from "@/lib/db/labels";
import { publishedByClaim } from "@/lib/db/publishing";
import { loadSearchResults } from "@/lib/db/search-results";
import {
  advanceDevelopment,
  developmentPreview,
  factualContextNeeded,
  furtherSearchPreview,
  initialDevelopment,
  lifecycleForDevelopment,
  sourceHash,
  type DevelopmentState,
  type EvidenceLabel,
  type RetrievedSource,
} from "@/lib/editorial/develop";
import { describeSource } from "@/lib/editorial/quality";
import { draftWithProviders } from "@/lib/drafts/chain";
import { publicPostUrl, sanitizeText } from "@/lib/intel/text";
import { researchLimits } from "@/lib/research/limits";
import { reviseResearchPlan } from "@/lib/research/plan";
import { beginResearch } from "@/lib/research/run";
import type { Pillar, StatementKind } from "@/lib/research/types";

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sourceFromUnderstanding(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = (value as { sourceText?: unknown }).sourceText;
  return typeof text === "string" ? text.trim() : "";
}

function asState(value: unknown, sourceText: string): DevelopmentState {
  const fresh = initialDevelopment(sourceText);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fresh;
  const row = value as Partial<DevelopmentState>;
  if (row.sourceHash !== fresh.sourceHash) return fresh;
  const completed = Array.isArray(row.completed)
    ? row.completed.filter((item): item is DevelopmentState["completed"][number] => item === "interpret" || item === "research" || item === "angle" || item === "draft")
    : fresh.completed;
  const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
    ? {
        label: (["none", "insufficient", "usable"] as EvidenceLabel[]).includes(row.evidence.label as EvidenceLabel) ? row.evidence.label as EvidenceLabel : "none" as const,
        sources: Array.isArray(row.evidence.sources)
          ? row.evidence.sources.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const source = item as { title?: unknown; url?: unknown; domain?: unknown; snippet?: unknown; opened?: unknown; text?: unknown; premise?: unknown; stance?: unknown; limitation?: unknown };
              if (typeof source.title !== "string" || typeof source.url !== "string" || typeof source.domain !== "string") return [];
              const stance: RetrievedSource["stance"] = source.stance === "supports" || source.stance === "contradicts" || source.stance === "contextualizes" || source.stance === "does_not_address" ? source.stance : undefined;
              return [{
                title: source.title,
                url: source.url,
                domain: source.domain,
                snippet: typeof source.snippet === "string" ? source.snippet : null,
                opened: source.opened === true,
                text: typeof source.text === "string" ? source.text : null,
                premise: typeof source.premise === "string" ? source.premise : undefined,
                stance,
                limitation: typeof source.limitation === "string" ? source.limitation : undefined,
              }];
            })
          : [],
      }
    : null;
  return {
    ...fresh,
    completed: completed.includes("interpret") ? completed : ["interpret", ...completed],
    evidence,
    evidenceStatus: row.evidenceStatus === "EVIDENCE_READY" || row.evidenceStatus === "RELEVANT_EVIDENCE_FOUND" || row.evidenceStatus === "EVIDENCE_INSUFFICIENT" ? row.evidenceStatus : null,
    searchStatus: row.searchStatus === "SEARCH_COMPLETED" ? row.searchStatus : null,
    failureKind: row.failureKind === "story-specific validation" || row.failureKind === "source relevance" || row.failureKind === "inadequate evidence" || row.failureKind === "unsupported statement" || row.failureKind === "invalid draft structure" ? row.failureKind : null,
    nextAction: typeof row.nextAction === "string" ? row.nextAction : null,
    angle: typeof row.angle === "string" ? row.angle : null,
    anglePoints: Array.isArray(row.anglePoints) ? row.anglePoints.filter((item): item is string => typeof item === "string") : [],
    drafts: Array.isArray(row.drafts)
      ? row.drafts.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const draft = item as { style?: unknown; text?: unknown; sourceHash?: unknown };
          if (typeof draft.style !== "string" || typeof draft.text !== "string" || draft.sourceHash !== fresh.sourceHash) return [];
          return [{ style: draft.style, text: draft.text, sourceHash: fresh.sourceHash }];
        })
      : [],
    unresolved: typeof row.unresolved === "string" ? row.unresolved : null,
    review: row.review === "Needs editorial review" ? row.review : fresh.review,
    researchCalls: typeof row.researchCalls === "number" ? row.researchCalls : 0,
    modelCalls: typeof row.modelCalls === "number" ? row.modelCalls : 0,
    researchFailed: row.researchFailed === true,
    draftFailed: row.draftFailed === true,
    gateFailed: row.gateFailed === true,
    ready: row.ready === true,
    running: false,
    quality: describeSource(sourceText),
  };
}

async function loadOpportunity(id: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!isUuid(id)) return { ok: false as const, message: "That conversation is not on the desk." };
  const primary = await db.from("opportunities").select("id, conversation_id, claim_id, content_pillar, understanding, development, updated_at, lifecycle").eq("id", id).maybeSingle();
  if (primary.error && columnMissing(primary.error.message) && /development/i.test(primary.error.message)) {
    return { ok: false as const, message: "Development storage is not on this database yet. Nothing was called." };
  }
  if (primary.error || !primary.data) return { ok: false as const, message: primary.error ? scrubDbMessage(primary.error.message) : "That conversation is not on the desk." };
  let sourceText = sourceFromUnderstanding(primary.data.understanding);
  if (!sourceText && primary.data.conversation_id) {
    const posts = await db.from("x_posts").select("text").eq("conversation_id", primary.data.conversation_id).order("posted_at");
    sourceText = (posts.data ?? []).map((row) => textOf(row.text)).filter(Boolean).join("\n\n").trim();
  }
  if (!sourceText) return { ok: false as const, message: "The stored source text is missing. Nothing was called." };
  const claimId = typeof primary.data.claim_id === "string" ? primary.data.claim_id : null;
  const published = claimId ? (await publishedByClaim()).has(claimId) : false;
  return {
    ok: true as const,
    row: primary.data,
    sourceText,
    claimId,
    published,
    pillar: primary.data.content_pillar === "football" || primary.data.content_pillar === "finance" ? primary.data.content_pillar : "politics" as Pillar,
  };
}

export async function previewDevelopment(id: string) {
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ...loaded, researchSearches: 0, modelRequests: 0 };
  const preview = developmentPreview(loaded.sourceText, { maxSearches: researchLimits.maxSearchesPerRun });
  if (loaded.published) {
    return {
      ok: true as const,
      blocked: true,
      message: "A published story stays published. Research searches: 0. New model requests: 0.",
      researchSearches: 0,
      modelRequests: 0,
      review: null,
    };
  }
  return { ok: true as const, ...preview };
}

async function ensureClaim(input: { opportunityId: string; claimId: string | null; conversationId: string | null; sourceText: string; premises: string[]; summary: string; pillar: Pillar; prediction: boolean }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const claimText = sanitizeText(input.premises.join(" ") || input.summary, 500);
  if (input.claimId) {
    await db.from("claims").update({
      claim_text: claimText,
      original_post_text: input.sourceText,
      attribution_note: input.summary,
    }).eq("id", input.claimId);
    return { ok: true as const, claimId: input.claimId };
  }
  const post = input.conversationId
    ? await db.from("x_posts").select("x_post_id, username").eq("conversation_id", input.conversationId).limit(1).maybeSingle()
    : { data: null };
  const kind: StatementKind = input.prediction ? "opinion" : input.premises.length ? "fact" : "opinion";
  const claim = await db.from("claims").insert({
    claim_text: claimText,
    conversation_id: input.conversationId,
    original_post_id: post.data?.x_post_id ?? null,
    original_post_url: post.data ? publicPostUrl(post.data.x_post_id, post.data.username) : null,
    original_author_username: post.data?.username ?? null,
    original_post_text: input.sourceText,
    detected_at: new Date().toISOString(),
    origin: "live",
    status: "new",
    content_pillar: input.pillar,
    statement_kind: kind,
    claim_types: [],
    research_questions: input.premises.slice(0, 4),
    proposed_verdict: "UNVERIFIED",
    verdict_reasoning: "Recomputed from the stored source before development. This is not a verdict.",
    verdict_caveats: input.summary,
    verdict_unknown: "Development has not finished.",
    attribution_note: input.summary,
    editor_notes: "Opened by Develop content. Research starts only when the corrected reading requires it.",
  }).select("id").single();
  if (claim.error || !claim.data) return { ok: false as const, message: scrubDbMessage(claim.error?.message || "claim") };
  return { ok: true as const, claimId: claim.data.id as string };
}

function retrievedSources(results: Array<{ domain: string; url: string; title: string; snippet?: string | null; retrievalStatus?: string }>) {
  return results
    .filter((item) => item.url.startsWith("https://"))
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      url: item.url,
      domain: item.domain,
      snippet: item.snippet ?? null,
      opened: item.retrievalStatus === "retrieved",
    }));
}

export async function developContent(id: string) {
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ok: false as const, message: loaded.message, researchCalls: 0, modelCalls: 0 };
  if (loaded.published) return { ok: false as const, message: "A published story stays published. It was not developed again.", researchCalls: 0, modelCalls: 0 };
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured.", researchCalls: 0, modelCalls: 0 };
  const updatedAt = textOf(loaded.row.updated_at);
  const state = asState(loaded.row.development, loaded.sourceText);
  const locked = await db.from("opportunities").update({
    development: { ...state, running: true },
    lifecycle: state.ready ? "READY_FOR_EDITOR" : "RESEARCHING",
  }).eq("id", id).eq("updated_at", updatedAt).select("id");
  if (locked.error && columnMissing(locked.error.message)) {
    return { ok: false as const, message: "Development storage is not on this database yet. Nothing was called.", researchCalls: 0, modelCalls: 0 };
  }
  if (locked.error || !locked.data?.length) {
    return { ok: false as const, message: "This conversation changed before development started. Nothing was called.", researchCalls: 0, modelCalls: 0 };
  }

  const beforeResearch = state.researchCalls;
  const beforeModel = state.modelCalls;
  let claimId = loaded.claimId;
  const finished = await advanceDevelopment(state, {
    research: async ({ premises, context }) => {
      const claim = await ensureClaim({
        opportunityId: id,
        claimId,
        conversationId: typeof loaded.row.conversation_id === "string" ? loaded.row.conversation_id : null,
        sourceText: loaded.sourceText,
        premises,
        summary: context,
        pillar: loaded.pillar,
        prediction: state.quality.primaryKind === "prediction",
      });
      if (!claim.ok) return { ok: false, called: false, label: "none" as const, sources: [], message: claim.message };
      claimId = claim.claimId;
      await db.from("opportunities").update({ claim_id: claim.claimId }).eq("id", id);
      const run = await beginResearch(claim.claimId);
      const already = /already been run/i.test(run.message);
      const listed = await loadSearchResults(claim.claimId);
      const sources = retrievedSources(listed.results);
      if (!run.ok && !already) {
        return { ok: false, called: run.started === true, label: "none" as const, sources, message: run.message };
      }
      return { ok: true, called: run.started === true && !already, label: "none" as const, sources, message: run.message };
    },
    draft: async ({ angle, points, verdict, postText, evidence }) => {
      if (!claimId) {
        const claim = await ensureClaim({
          opportunityId: id,
          claimId,
          conversationId: typeof loaded.row.conversation_id === "string" ? loaded.row.conversation_id : null,
          sourceText: loaded.sourceText,
          premises: state.quality.checkableFacts,
          summary: state.quality.summary,
          pillar: loaded.pillar,
          prediction: state.quality.primaryKind === "prediction",
        });
        if (!claim.ok) return { ok: false, called: false, drafts: [], message: claim.message };
        claimId = claim.claimId;
        await db.from("opportunities").update({ claim_id: claim.claimId }).eq("id", id);
      }
      const used = await calledToday();
      const plans = planDraftProviders(readAiEnv(), used);
      if (!plans.some((plan) => plan.callable)) {
        return { ok: false, called: false, drafts: [], message: "The draft allowance is used up. Research already stored was kept. No model request was made." };
      }
      const result = await draftWithProviders({
        requestId: crypto.randomUUID(),
        task: "draft",
        brief: {
          claim: state.quality.checkableFacts.join(" ") || state.quality.summary,
          postText,
          verdict,
          confidence: "low",
          angleTitle: angle,
          anglePoints: points,
          take: null,
          evidence: evidence.map((item) => ({ kind: "opened source", label: item.domain || item.title, note: item.limitation || item.title, url: item.url })),
          contentPillar: loaded.pillar,
          attribution: state.quality.summary,
          interpretation: state.quality.reason,
          premises: state.quality.checkableFacts,
          limitations: state.unresolved || "Say what this desk has not confirmed. Do not invent a verdict.",
        },
        rules: "development",
        plans,
        timeoutMs: 18_000,
        call: (plan, request) => callProvider(plan, request),
      });
      await persistAttempts(result.attempts);
      const called = result.attempts.length > 0;
      if (result.outcome !== "saved" || result.drafts.length === 0) {
        return { ok: false, called, drafts: [], message: result.message };
      }
      const stored = await storeGeneratedDrafts(claimId, result.drafts, {
        provider: result.provider || "groq",
        model: result.model,
        sourceHash: sourceHash(loaded.sourceText),
      });
      if (!stored.ok) {
        return { ok: true, called, drafts: result.drafts.map((draft) => ({ style: draft.style, text: draft.text })), message: `${stored.message} The draft text is held on this development. It was not requested again.` };
      }
      return { ok: true, called, drafts: result.drafts.map((draft) => ({ style: draft.style, text: draft.text })), message: result.message };
    },
  });
  finished.running = false;
  const lifecycle = lifecycleForDevelopment(finished);
  const saved = await db.from("opportunities").update({
    development: finished,
    lifecycle,
    claim_id: claimId,
    possible_angle: finished.angle,
  }).eq("id", id);
  if (claimId && finished.angle) {
    await db.from("claims").update({
      editor_angle: "own",
      editor_angle_text: finished.angle,
      attribution_note: finished.quality.summary,
      verdict_unknown: finished.unresolved,
      proposed_verdict: finished.ready ? "UNVERIFIED" : "UNVERIFIED",
      verdict_reasoning: finished.unresolved || finished.quality.reason,
      verdict_recorded_at: finished.ready ? new Date().toISOString() : null,
    }).eq("id", claimId);
  }
  await recordEvent({
    action: "content developed",
    actor: "editor",
    subjectType: "opportunity",
    subjectId: id,
    detail: {
      lifecycle,
      researchCalls: finished.researchCalls - beforeResearch,
      modelCalls: finished.modelCalls - beforeModel,
      ready: finished.ready,
      review: finished.review,
      xRequests: 0,
      posted: false,
    },
  });
  if (saved.error) return { ok: false as const, message: scrubDbMessage(saved.error.message), researchCalls: finished.researchCalls - beforeResearch, modelCalls: finished.modelCalls - beforeModel };
  const message = finished.ready
    ? "A draft is ready for you. Nothing was published."
    : finished.review
      ? `${finished.review}. ${finished.unresolved || ""}`.trim()
      : finished.error || finished.unresolved || "Development stopped. Work already stored was kept.";
  return {
    ok: finished.ready || Boolean(finished.review) || !finished.error,
    message,
    researchCalls: finished.researchCalls - beforeResearch,
    modelCalls: finished.modelCalls - beforeModel,
    ready: finished.ready,
    review: finished.review,
    lifecycle,
    deferred: !factualContextNeeded(finished.quality) && finished.quality.researchNeed !== "yes",
    failureKind: finished.failureKind,
  };
}

export async function furtherResearch(id: string, confirm: boolean) {
  const preview = furtherSearchPreview();
  if (!confirm) return { ok: true as const, ...preview, called: false as const };
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ok: false as const, message: loaded.message, called: false as const };
  if (!loaded.claimId) return { ok: false as const, message: "There is no saved research to continue. No search was sent.", called: false as const };
  const advanced = await reviseResearchPlan(loaded.claimId, "advance");
  if (!advanced.ok) return { ok: false as const, message: advanced.message, called: false as const };
  const accepted = await reviseResearchPlan(loaded.claimId, "accept");
  if (!accepted.ok) return { ok: false as const, message: accepted.message, called: false as const };
  const run = await beginResearch(loaded.claimId);
  return { ok: run.ok, message: run.message, called: run.started === true, searches: "searches" in run ? run.searches : 0 };
}
