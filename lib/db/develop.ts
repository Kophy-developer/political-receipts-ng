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
import { composeEditorialPosts } from "@/lib/editorial/findings";
import {
  advanceDevelopment,
  angleFor,
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
import { chooseDocumentIds, examineSources } from "@/lib/research/examine";
import { investigate } from "@/lib/research/investigate";
import { retrieveStoredResults } from "@/lib/research/retrieve-selected";
import { reviveAnalysis } from "@/lib/research/series";
import { storyQuality } from "@/lib/editorial/pillar-reading";
import { describeSource } from "@/lib/editorial/quality";
import { draftWithProviders } from "@/lib/drafts/chain";
import { publicPostUrl, sanitizeText } from "@/lib/intel/text";
import { researchLimits } from "@/lib/research/limits";
import { reviseResearchPlan } from "@/lib/research/plan";
import { hashOfPlan, readStoredPlan } from "@/lib/research/canonical";
import { matchStructuredQuestion, retrieveWorldBank } from "@/lib/research/official-series";
import { prepareOfficialDevelopment } from "@/lib/research/official-workflow";
import { readProvenance, resolveOfficialSeries, recordedWorldBankFdi } from "@/lib/research/structured-cache";
import { loadStructuredCache, saveStructuredCache } from "@/lib/db/structured-cache";
import { beginResearch } from "@/lib/research/run";
import { fileRetrievedEvidence } from "@/lib/db/research";
import { describeContinuation, type ResearchBlocker } from "@/lib/research/resume";
import { storeResearchPlan } from "@/lib/research/plan";
import { usageSince } from "@/lib/db/usage";
import { lagosDayStart } from "@/lib/intel/limits";
import type { Pillar, StatementKind } from "@/lib/research/types";

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sourceFromUnderstanding(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = (value as { sourceText?: unknown }).sourceText;
  return typeof text === "string" ? text.trim() : "";
}

function asState(value: unknown, sourceText: string, pillar?: string | null): DevelopmentState {
  const fresh = initialDevelopment(sourceText, pillar);
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
    quality: fresh.quality,
    investigation: null,
    analysis: reviveAnalysis((row as { analysis?: unknown }).analysis),
    seriesProvenance: readProvenance((row as { seriesProvenance?: unknown }).seriesProvenance),
    researchStage: row.researchStage === "SEARCH_COMPLETED" || row.researchStage === "SOURCES_RETRIEVED" || row.researchStage === "EVIDENCE_EXAMINED" || row.researchStage === "EVIDENCE_INSUFFICIENT" || row.researchStage === "EVIDENCE_READY" ? row.researchStage : null,
    continuations: typeof row.continuations === "number" && row.continuations >= 0 ? Math.floor(row.continuations) : 0,
    blocker: typeof row.blocker === "string" ? row.blocker : null,
    priorPlans: Array.isArray((row as { priorPlans?: unknown }).priorPlans)
      ? (row as { priorPlans: unknown[] }).priorPlans.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const plan = item as { hash?: unknown; queries?: unknown };
          const queries = Array.isArray(plan.queries) ? plan.queries.filter((query): query is string => typeof query === "string") : [];
          return [{ hash: typeof plan.hash === "string" ? plan.hash : null, queries }];
        })
      : [],
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
  const preview = developmentPreview(loaded.sourceText, { maxSearches: researchLimits.maxSearchesPerRun }, loaded.pillar);
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

export async function loadDocumentPassages(claimId: string) {
  return passagesByUrl(claimId);
}

async function passagesByUrl(claimId: string) {
  const found = new Map<string, string>();
  const db = serviceClient();
  if (!db) return found;
  const evidence = await db.from("evidence").select("excerpt, source_id").eq("claim_id", claimId);
  const sourceIds = (evidence.data ?? []).map((row) => row.source_id).filter((id): id is string => typeof id === "string");
  if (!sourceIds.length) return found;
  const sources = await db.from("sources").select("id, url").in("id", sourceIds);
  const urls = new Map((sources.data ?? []).flatMap((row) => typeof row.id === "string" && typeof row.url === "string" ? [[row.id, row.url] as const] : []));
  for (const row of evidence.data ?? []) {
    const url = typeof row.source_id === "string" ? urls.get(row.source_id) : undefined;
    if (url && typeof row.excerpt === "string" && row.excerpt.trim()) found.set(url, row.excerpt);
  }
  return found;
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
  const state = asState(loaded.row.development, loaded.sourceText, loaded.pillar);
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
      const dataset = matchStructuredQuestion(`${loaded.sourceText}\n${context}`);
      if (dataset?.status === "available" && dataset.apiUrl) {
        const now = new Date().toISOString();
        const passages = await passagesByUrl(claim.claimId);
        const stored = passages.get(dataset.pageUrl) ?? null;
        const cache = await loadStructuredCache(dataset.id, now);
        const series = await resolveOfficialSeries(dataset, {
          mode: stored ? "saved" : "live",
          now,
          cache,
          recordedBody: recordedWorldBankFdi,
          load: async () => {
            const retrieved = await retrieveWorldBank(dataset);
            if (!retrieved.ok) return { message: retrieved.message };
            return retrieved.body;
          },
        });
        if (!series.ok) return { ok: false, called: false, label: "none" as const, sources: [], message: series.message };
        await saveStructuredCache(series.record);
        if (!stored) {
          const filed = await fileRetrievedEvidence({
            claimId: claim.claimId,
            pillar: loaded.pillar,
            url: dataset.pageUrl,
            domain: "data.worldbank.org",
            title: `${dataset.series}, ${dataset.country}`,
            organization: dataset.sourceName,
            published: series.record.sourceUpdated,
            passage: series.record.passage,
            pageLabel: "annual series",
            tierRank: 1,
            tierName: "Official statistics",
            problem: null,
            question: dataset.reason,
            notes: `${series.record.label} Indicator ${dataset.indicator}. No search and no PDF download.`.slice(0, 480),
          });
          if (!filed.ok) return { ok: false, called: false, label: "none" as const, sources: [], message: filed.message };
        }
        return {
          ok: true,
          called: false,
          label: "none" as const,
          sources: [{ title: dataset.series, url: dataset.pageUrl, domain: "data.worldbank.org", opened: true, text: series.record.passage }],
          message: series.record.label,
        };
      }
      const run = await beginResearch(claim.claimId);
      const already = /already been run/i.test(run.message);
      if (!run.ok && !already) {
        const listed = await loadSearchResults(claim.claimId);
        return { ok: false, called: run.started === true, label: "none" as const, sources: retrievedSources(listed.results), message: run.message };
      }
      const plan = investigate(loaded.sourceText, storyQuality(loaded.sourceText, loaded.pillar, describeSource(loaded.sourceText)), loaded.pillar);
      const listed = await loadSearchResults(claim.claimId);
      const pending = chooseDocumentIds(listed.results, plan, researchLimits.maxDocumentsPerRun)
        .filter((resultId) => listed.results.some((item) => item.id === resultId && item.retrievalStatus !== "retrieved"));
      if (pending.length) await retrieveStoredResults(claim.claimId, pending);
      const opened = await loadSearchResults(claim.claimId);
      const passages = await passagesByUrl(claim.claimId);
      const sources = retrievedSources(opened.results).map((source) => {
        const passage = passages.get(source.url);
        return passage ? { ...source, opened: true, text: passage } : source;
      });
      return { ok: true, called: run.started === true && !already, label: "none" as const, sources, message: run.message };
    },
    draft: async ({ angle, points, verdict, postText, evidence, analysis }) => {
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
      if (analysis?.chart && analysis.comparable) {
        return {
          ok: true,
          called: false,
          drafts: composeEditorialPosts({ quality: state.quality, analysis }),
          message: "The drafts were written from the opened series. No model request was made.",
        };
      }
      const used = await calledToday();
      const plans = planDraftProviders(readAiEnv(), used);
      if (!plans.some((plan) => plan.callable)) {
        if (analysis?.chart && analysis.comparable) {
          return {
            ok: true,
            called: false,
            drafts: composeEditorialPosts({ quality: state.quality, analysis }),
            message: "The draft was written from the opened series. No model request was made.",
          };
        }
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
          limitations: analysis?.chart
            ? `Use only these opened figures: ${analysis.observations.map((item) => `${item.year} ${item.value} ${item.unit}`).join("; ")}. Do not invent a year or a number. ${analysis.limitations.join(" ")}`
            : state.unresolved || "Say what this desk has not confirmed. Do not invent a verdict.",
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
  }, loaded.pillar);
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

function blockerOf(value: string | null | undefined): ResearchBlocker {
  if (value && /limit is reached|allowance|could not be read|not configured|provider/i.test(value)) return "Provider or budget failure";
  if (value === "No relevant source found" || value === "Document could not be opened" || value === "Table unavailable" || value === "Series incomplete" || value === "Incompatible definitions" || value === "Provider or budget failure") return value;
  return "No relevant source found";
}

function researchBlocker(state: DevelopmentState, error: string | null): ResearchBlocker {
  if (state.researchFailed) return blockerOf(error);
  if (state.analysis && !state.analysis.comparable) return "Incompatible definitions";
  if (state.analysis && state.analysis.missingYears.length > 0 && !state.analysis.chart) return "Series incomplete";
  const opened = state.evidence?.sources.filter((item) => item.opened) ?? [];
  if (opened.length > 0 && opened.every((item) => !item.text?.trim())) return "Document could not be opened";
  if (opened.length > 0 && !state.analysis?.chart) return "Table unavailable";
  return "No relevant source found";
}

async function continuationInputs(claimId: string | null) {
  const empty = { claim: "", runs: [] as Array<{ hash: string | null; status: string; operations: number }>, results: [] as Awaited<ReturnType<typeof loadSearchResults>>["results"], previous: null as ReturnType<typeof readStoredPlan> };
  if (!claimId) return empty;
  const db = serviceClient();
  if (!db) return empty;
  const claim = await db.from("claims").select("claim_text, research_plan").eq("id", claimId).maybeSingle();
  const runs = await db.from("research_runs").select("plan_hash, status, operations_used").eq("claim_id", claimId);
  const listed = await loadSearchResults(claimId);
  return {
    claim: typeof claim.data?.claim_text === "string" ? claim.data.claim_text : "",
    runs: (runs.data ?? []).map((row) => ({
      hash: typeof row.plan_hash === "string" ? row.plan_hash : null,
      status: typeof row.status === "string" ? row.status : "",
      operations: typeof row.operations_used === "number" ? row.operations_used : 0,
    })),
    results: listed.results,
    previous: readStoredPlan(claim.data?.research_plan),
  };
}

export async function continuationOffer(id: string) {
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ok: false as const, message: loaded.message, available: false };
  const state = asState(loaded.row.development, loaded.sourceText, loaded.pillar);
  const records = await continuationInputs(loaded.claimId);
  const usage = await usageSince(lagosDayStart());
  const investigation = investigate(loaded.sourceText, state.quality);
  const offer = describeContinuation({
    claim: records.claim || loaded.sourceText,
    sourceText: loaded.sourceText,
    liveStructuredFailed: /World Bank API did not answer|World Bank API returned/i.test(state.error || ""),
    investigation,
    sources: records.results.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      domain: item.domain,
      snippet: item.snippet,
      opened: item.retrievalStatus === "retrieved",
      retrievalStatus: item.retrievalStatus,
      inDomain: item.inDomain,
      rejection: item.rejectionReason,
    })),
    runs: records.runs,
    continuations: state.continuations,
    published: loaded.published,
    ready: state.ready,
    searchCompleted: state.completed.includes("research") || state.searchStatus === "SEARCH_COMPLETED",
    evidenceReady: state.evidenceStatus === "EVIDENCE_READY",
    searchesUsed: usage.ok ? usage.totals.searches : researchLimits.dailySearches,
    retrievalsUsed: usage.ok ? usage.totals.retrievals : researchLimits.dailyRetrievals,
    maxSearchesPerRun: researchLimits.maxSearchesPerRun,
    maxDocumentsPerRun: researchLimits.maxDocumentsPerRun,
    dailySearches: researchLimits.dailySearches,
    dailyRetrievals: researchLimits.dailyRetrievals,
  });
  if (!usage.ok) {
    return { ok: true as const, ...offer, available: false, blocker: "Provider or budget failure" as const, message: "Research usage could not be read. No search was sent." };
  }
  const message = offer.available
    ? `Continue research. ${offer.question} ${offer.why} Expected requests: ${offer.searches} searches and ${offer.documents} documents. Remaining today: ${offer.searchesRemaining} searches and ${offer.documentsRemaining} documents. Nothing runs until you confirm.`
    : offer.blocker || offer.why;
  return { ok: true as const, ...offer, message };
}

async function applyOfficialSeries(id: string, mode: "live" | "saved") {
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ok: false as const, message: loaded.message, called: false as const, searched: false as const };
  if (loaded.published) return { ok: false as const, message: "A published story stays published. Nothing was read.", called: false as const, searched: false as const };
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured.", called: false as const, searched: false as const };
  const updatedAt = textOf(loaded.row.updated_at);
  const state = asState(loaded.row.development, loaded.sourceText, loaded.pillar);
  const dataset = matchStructuredQuestion(`${loaded.sourceText}\n${state.quality.summary}`);
  if (!dataset || dataset.status !== "available" || !dataset.apiUrl) {
    return { ok: false as const, message: dataset?.reason || "No official series matches this story. No search was sent.", called: false as const, searched: false as const };
  }
  const locked = await db.from("opportunities").update({ development: { ...state, running: true }, lifecycle: "RESEARCHING" }).eq("id", id).eq("updated_at", updatedAt).select("id");
  if (locked.error || !locked.data?.length) return { ok: false as const, message: "This conversation changed before the series was read. Nothing was retrieved.", called: false as const, searched: false as const };
  let claimId = loaded.claimId;
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
    if (!claim.ok) return { ok: false as const, message: claim.message, called: false as const, searched: false as const };
    claimId = claim.claimId;
    await db.from("opportunities").update({ claim_id: claimId }).eq("id", id);
  }
  const now = new Date().toISOString();
  const passages = await passagesByUrl(claimId);
  const stored = passages.get(dataset.pageUrl) ?? null;
  const cache = await loadStructuredCache(dataset.id, now);
  const series = await resolveOfficialSeries(dataset, {
    mode: stored ? "saved" : mode,
    now,
    cache,
    recordedBody: recordedWorldBankFdi,
    load: async () => {
      const retrieved = await retrieveWorldBank(dataset);
      if (!retrieved.ok) return { message: retrieved.message };
      return retrieved.body;
    },
  });
  if (!series.ok) {
    const failed = { ...state, running: false, error: series.message, blocker: "Provider or budget failure" as const, unresolved: series.message };
    await db.from("opportunities").update({ development: failed, lifecycle: lifecycleForDevelopment(failed) }).eq("id", id);
    return { ok: false as const, called: false as const, searched: false as const, message: series.message };
  }
  await saveStructuredCache(series.record);
  if (!stored) {
    const filed = await fileRetrievedEvidence({
      claimId,
      pillar: loaded.pillar,
      url: dataset.pageUrl,
      domain: "data.worldbank.org",
      title: `${dataset.series}, ${dataset.country}`,
      organization: dataset.sourceName,
      published: series.record.sourceUpdated,
      passage: series.record.passage,
      pageLabel: "annual series",
      tierRank: 1,
      tierName: "Official statistics",
      problem: null,
      question: dataset.reason,
      notes: `${series.record.label} Indicator ${dataset.indicator}. The earlier searches were kept. No PDF was downloaded.`.slice(0, 480),
    });
    if (!filed.ok) return { ok: false as const, message: filed.message, called: false as const, searched: false as const };
  }
  const prepared = prepareOfficialDevelopment({ sourceText: loaded.sourceText, record: series.record, quality: state.quality });
  const ready = prepared.ready;
  const finished: DevelopmentState = {
    ...state,
    running: false,
    investigation: prepared.investigation,
    analysis: prepared.analysis,
    seriesProvenance: prepared.provenance,
    researchStage: prepared.stage,
    evidence: { label: ready ? "usable" : "insufficient", sources: prepared.sources },
    evidenceStatus: ready ? "EVIDENCE_READY" : "EVIDENCE_INSUFFICIENT",
    searchStatus: "SEARCH_COMPLETED",
    completed: ready ? ["interpret", "research", "angle", "draft"] : state.completed,
    angle: prepared.angle?.title ?? state.angle,
    anglePoints: prepared.angle?.points ?? state.anglePoints,
    drafts: prepared.drafts.length ? prepared.drafts.map((item) => ({ style: item.style, text: item.text, sourceHash: state.sourceHash })) : state.drafts,
    ready,
    review: ready ? null : "Needs editorial review",
    blocker: ready ? null : "No relevant source found",
    unresolved: ready ? prepared.provenance.label : series.record.label,
    error: null,
  };
  await db.from("opportunities").update({ development: finished, lifecycle: lifecycleForDevelopment(finished), possible_angle: finished.angle }).eq("id", id);
  await recordEvent({
    action: "content developed",
    actor: "editor",
    subjectType: "opportunity",
    subjectId: id,
    detail: { structured: dataset.indicator, origin: series.record.origin, live: series.live, fetched: series.fetched, searched: false, modelCalls: 0, xRequests: 0, posted: false, ready },
  });
  const saved = series.record.origin === "live" ? "A draft is ready for you. Nothing was published, searched, or sent to a model." : "A draft is ready from the saved official series. This was not a live retrieval. Nothing was published.";
  return { ok: ready, called: false as const, searched: false as const, message: ready ? saved : series.record.label };
}

export async function readOfficialSeries(id: string, confirm: boolean) {
  const preview = await continuationOffer(id);
  if (!confirm) return { ...preview, called: false as const, searched: false as const };
  if (!preview.ok || !preview.structuredId) {
    return { ok: false as const, called: false as const, searched: false as const, message: preview.ok ? "No official series is waiting. No search was sent." : preview.message };
  }
  if (preview.savedData) return applyOfficialSeries(id, "saved");
  return applyOfficialSeries(id, "live");
}

export async function resumeValidatedSeries(id: string, confirm: boolean) {
  const preview = await continuationOffer(id);
  if (!confirm) return { ...preview, called: false as const, searched: false as const };
  if (!preview.ok || !preview.savedData) {
    return { ok: false as const, called: false as const, searched: false as const, message: preview.ok ? "No validated saved series is waiting. The live API was not called." : preview.message };
  }
  return applyOfficialSeries(id, "saved");
}

export async function continueContent(id: string, confirm: boolean) {
  const preview = await continuationOffer(id);
  if (!confirm) return { ...preview, called: false as const };
  if (preview.ok && preview.savedData) return resumeValidatedSeries(id, confirm);
  if (preview.ok && preview.structuredId) return readOfficialSeries(id, confirm);
  if (preview.ok && preview.available && preview.searches === 0 && preview.openIds.length > 0) return openSavedDocuments(id, true);
  if (!preview.ok || !preview.available) {
    return { ok: false as const, message: preview.ok ? (preview.blocker || preview.message) : preview.message, called: false as const };
  }
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ok: false as const, message: loaded.message, called: false as const };
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured.", called: false as const };
  const records = await continuationInputs(loaded.claimId);
  if (!loaded.claimId || (!preview.plan && preview.openIds.length === 0)) return { ok: false as const, message: preview.blocker || "No relevant source found", called: false as const };
  if (preview.plan) {
    const stored = await storeResearchPlan(loaded.claimId, preview.plan);
    if (!stored) return { ok: false as const, message: "The research plan could not be stored. No search was sent.", called: false as const };
  }
  const state = asState(loaded.row.development, loaded.sourceText, loaded.pillar);
  const priorPlans = [...state.priorPlans, { hash: records.previous ? hashOfPlan(records.previous, records.previous.providerId) : null, queries: records.previous?.searches.map((item) => item.query) ?? [] }];
  const resumed = { ...state, completed: ["interpret"] as DevelopmentState["completed"], ready: false, review: null, priorPlans, blocker: null, investigation: investigate(loaded.sourceText, state.quality, loaded.pillar) };
  const updatedAt = textOf(loaded.row.updated_at);
  const locked = await db.from("opportunities").update({ development: { ...resumed, running: true }, lifecycle: "RESEARCHING" }).eq("id", id).eq("updated_at", updatedAt).select("id");
  if (locked.error || !locked.data?.length) return { ok: false as const, message: "This conversation changed before research continued. Nothing was called.", called: false as const };
  const result = await developContent(id);
  const after = await loadOpportunity(id);
  if (after.ok) {
    const finished = asState(after.row.development, after.sourceText, after.pillar);
    const blocker: ResearchBlocker | null = finished.ready ? null : researchBlocker(finished, finished.error);
    const kept = finished.researchFailed
      ? { ...finished, completed: finished.completed.includes("research") ? finished.completed : [...finished.completed, "research"] as DevelopmentState["completed"], continuations: finished.continuations + 1, blocker, running: false }
      : { ...finished, continuations: finished.continuations + 1, blocker, running: false, priorPlans };
    await db.from("opportunities").update({ development: kept, lifecycle: lifecycleForDevelopment(kept) }).eq("id", id);
  }
  return { ...result, called: result.researchCalls > 0 };
}

export async function openSavedDocuments(id: string, confirm: boolean) {
  const preview = await continuationOffer(id);
  if (!confirm) return { ...preview, called: false as const, searched: false as const };
  if (!preview.ok || preview.searches > 0 || preview.openIds.length === 0) {
    return { ok: false as const, called: false as const, searched: false as const, message: preview.ok ? (preview.why || "No saved document is waiting to be opened. No search was sent.") : preview.message };
  }
  const loaded = await loadOpportunity(id);
  if (!loaded.ok) return { ok: false as const, message: loaded.message, called: false as const, searched: false as const };
  if (loaded.published) return { ok: false as const, message: "A published story stays published. Nothing was opened.", called: false as const, searched: false as const };
  const db = serviceClient();
  if (!db || !loaded.claimId) return { ok: false as const, message: "The database is not configured.", called: false as const, searched: false as const };
  const updatedAt = textOf(loaded.row.updated_at);
  const state = asState(loaded.row.development, loaded.sourceText, loaded.pillar);
  const locked = await db.from("opportunities").update({ development: { ...state, running: true }, lifecycle: "RESEARCHING" }).eq("id", id).eq("updated_at", updatedAt).select("id");
  if (locked.error || !locked.data?.length) return { ok: false as const, message: "This conversation changed before a document was opened. Nothing was retrieved.", called: false as const, searched: false as const };
  const retrieved = await retrieveStoredResults(loaded.claimId, preview.openIds);
  const listed = await loadSearchResults(loaded.claimId);
  const passages = await passagesByUrl(loaded.claimId);
  const investigation = investigate(loaded.sourceText, state.quality);
  const sources = retrievedSources(listed.results).map((source) => {
    const passage = passages.get(source.url);
    return passage ? { ...source, opened: true, text: passage } : source;
  });
  const examined = examineSources(investigation, sources);
  const angle = examined.analysis?.chart && examined.analysis.comparable ? angleFor(state.quality, { label: "usable", sources }, examined.analysis) : null;
  const posts = examined.analysis?.chart && examined.analysis.comparable
    ? composeEditorialPosts({ quality: state.quality, analysis: examined.analysis })
    : [];
  const ready = posts.length === 3;
  const finished: DevelopmentState = {
    ...state,
    running: false,
    investigation,
    analysis: examined.analysis,
    researchStage: examined.stage,
    evidence: { label: ready ? "usable" : "insufficient", sources: examined.sources },
    evidenceStatus: ready ? "EVIDENCE_READY" : "EVIDENCE_INSUFFICIENT",
    searchStatus: "SEARCH_COMPLETED",
    completed: ready ? ["interpret", "research", "angle", "draft"] : state.completed.includes("research") ? state.completed : [...state.completed, "research"],
    angle: angle?.title ?? state.angle,
    anglePoints: angle?.points ?? state.anglePoints,
    drafts: posts.length ? posts.map((item) => ({ style: item.style, text: item.text, sourceHash: state.sourceHash })) : state.drafts,
    ready,
    review: ready ? null : "Needs editorial review",
    blocker: ready ? null : researchBlocker({ ...state, analysis: examined.analysis, evidence: { label: "insufficient", sources: examined.sources }, researchFailed: !retrieved.ok }, retrieved.ok ? null : retrieved.message),
    unresolved: ready ? "Opened figures are in the draft. This is not a verdict." : retrieved.message,
    error: retrieved.ok ? null : retrieved.message,
  };
  await db.from("opportunities").update({
    development: finished,
    lifecycle: lifecycleForDevelopment(finished),
    possible_angle: finished.angle,
  }).eq("id", id);
  await recordEvent({
    action: "content developed",
    actor: "editor",
    subjectType: "opportunity",
    subjectId: id,
    detail: { retrieved: retrieved.retrieved, searched: false, modelCalls: 0, xRequests: 0, posted: false, ready },
  });
  return { ok: retrieved.ok || ready, called: retrieved.retrieved > 0, searched: false as const, message: ready ? "A draft is ready for you. Nothing was published and no model was called." : retrieved.message };
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
