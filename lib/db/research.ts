import "server-only";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { isUuid } from "@/lib/db/labels";
import { inferClaimTypes, inferStatementKind, questionsFor } from "@/lib/research/claim-types";
import { proposeVerdict, type Verdict } from "@/lib/research/verdict";
import type { Pillar, ProposedVerdict, StatementKind } from "@/lib/research/types";
import { sanitizeText } from "@/lib/intel/text";

const pillars = new Set<Pillar>(["politics", "football", "finance"]);
const verdicts = new Set<ProposedVerdict>(["SUPPORTED", "CONTRADICTED", "MISLEADING", "NEEDS CONTEXT", "UNVERIFIED", "INSUFFICIENT EVIDENCE"]);
const stances = new Set(["supports", "contradicts", "contextualizes", "attribution_only"]);

function slug(value: string) {
  return `desk-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}`;
}

export async function createManualClaim(input: {
  claim: string;
  speaker: string;
  pillar: string;
  topic: string;
  notes: string;
  postUrl: string;
  entities?: string;
  statementKind?: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const claim = sanitizeText(input.claim, 500);
  const speaker = sanitizeText(input.speaker, 80);
  const topicName = sanitizeText(input.topic, 80) || "Unsorted";
  const notes = sanitizeText(input.notes, 500);
  const entities = (input.entities ?? "")
    .split(/[,·]/)
    .map((item) => sanitizeText(item, 60))
    .filter(Boolean)
    .slice(0, 8);
  if (claim.length < 24) return { ok: false as const, message: "The claim needs a full sentence." };
  if (!pillars.has(input.pillar as Pillar)) return { ok: false as const, message: "Choose politics, football, or finance." };
  const pillar = input.pillar as Pillar;
  const kind: StatementKind = input.statementKind === "analysis" || input.statementKind === "opinion" || input.statementKind === "fact"
    ? input.statementKind
    : inferStatementKind(pillar, claim);
  let postUrl: string | null = null;
  if (input.postUrl.trim()) {
    try {
      const url = new URL(input.postUrl.trim());
      if (url.protocol !== "https:") return { ok: false as const, message: "A source post URL has to start with https." };
      postUrl = url.toString().slice(0, 300);
    } catch {
      return { ok: false as const, message: "That post URL could not be read." };
    }
  }
  const types = inferClaimTypes(claim, pillar);
  const questions = questionsFor(types, pillar).map((item) => item.question);
  const topicSlug = slug(topicName);
  let topicId: string | null = null;
  const insertedTopic = await db.from("topics").insert({ name: topicName, slug: topicSlug, origin: "live" }).select("id").maybeSingle();
  if (insertedTopic.data) topicId = insertedTopic.data.id as string;
  else if (insertedTopic.error?.code === "23505") {
    const existing = await db.from("topics").select("id").eq("slug", topicSlug).maybeSingle();
    topicId = existing.data?.id ?? null;
  } else if (insertedTopic.error) {
    return { ok: false as const, message: scrubDbMessage(insertedTopic.error.message) };
  }
  if (!topicId) return { ok: false as const, message: "The topic could not be filed." };
  const verdict = proposeVerdict({ statementKind: kind, evidence: [] });
  const { data, error } = await db
    .from("claims")
    .insert({
      claim_text: claim,
      topic_id: topicId,
      mentioned_entities: entities,
      original_author: speaker || null,
      original_post_url: postUrl,
      editor_notes: notes || null,
      detected_at: new Date().toISOString(),
      origin: "live",
      status: "new",
      content_pillar: pillar,
      statement_kind: kind,
      claim_types: types,
      research_questions: questions,
      attribution_note: verdict.attribution,
      proposed_verdict: verdict.factual,
      verdict_reasoning: verdict.reasoning,
      verdict_caveats: verdict.caveats,
      verdict_unknown: verdict.unknown,
      verdict_confidence: verdict.confidence,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "claim") };
  await recordEvent({
    action: "claim created",
    actor: "editor",
    subjectType: "claim",
    subjectId: data.id,
    detail: { pillar, statementKind: kind, manual: true },
  });
  return { ok: true as const, id: data.id as string, claim, pillar, types, questions, verdict };
}

export async function rollingMix() {
  const db = serviceClient();
  const empty = [
    { pillar: "politics" as const, label: "Politics", count: 0, share: 0, target: 60 },
    { pillar: "football" as const, label: "Manchester United", count: 0, share: 0, target: 20 },
    { pillar: "finance" as const, label: "Finance", count: 0, share: 0, target: 20 },
  ];
  if (!db) return { installed: false, counted: 0, items: empty };
  const { data, error } = await db
    .from("claims")
    .select("content_pillar")
    .eq("origin", "live")
    .not("content_pillar", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { installed: false, counted: 0, items: empty };
  const rows = data ?? [];
  const counts = { politics: 0, football: 0, finance: 0 };
  for (const row of rows) {
    const pillar: unknown = row.content_pillar;
    if (pillar === "politics" || pillar === "football" || pillar === "finance") counts[pillar] += 1;
  }
  const total = rows.length;
  return {
    installed: true,
    counted: total,
    items: empty.map((item) => ({
      ...item,
      count: counts[item.pillar],
      share: total ? Math.round((counts[item.pillar] / total) * 100) : 0,
    })),
  };
}

async function acceptedEvidence(claimId: string) {
  const db = serviceClient();
  if (!db) return [];
  const { data } = await db
    .from("evidence")
    .select("stance, review_status, sources ( url, tier_rank, domain )")
    .eq("claim_id", claimId);
  return (data ?? []).map((row) => {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    const domain = typeof source?.domain === "string" ? source.domain : "";
    const url = typeof source?.url === "string" ? source.url : "";
    const social = /(?:^|\.)((x|twitter|facebook|instagram|tiktok)\.com)$/i.test(domain) || /https?:\/\/(www\.)?(x|twitter)\.com/i.test(url);
    const stance = stances.has(row.stance) ? row.stance : "contextualizes";
    const review = row.review_status === "accepted" || row.review_status === "rejected" ? row.review_status : "proposed";
    return {
      stance: stance as "supports" | "contradicts" | "contextualizes" | "attribution_only",
      review: review as "proposed" | "accepted" | "rejected",
      tierRank: typeof source?.tier_rank === "number" ? source.tier_rank : 4,
      social,
    };
  });
}

export async function storeVerdict(claimId: string, statementKind: StatementKind) {
  const db = serviceClient();
  if (!db) return null;
  const verdict = proposeVerdict({ statementKind, evidence: await acceptedEvidence(claimId) });
  await db
    .from("claims")
    .update({
      proposed_verdict: verdict.factual,
      verdict_reasoning: verdict.reasoning,
      verdict_caveats: verdict.caveats,
      verdict_unknown: verdict.unknown,
      verdict_confidence: verdict.confidence,
      attribution_note: verdict.attribution,
    })
    .eq("id", claimId);
  return verdict;
}

export async function reviewResearch(input: {
  claimId: string;
  action: string;
  evidenceId?: string;
  tierRank?: number;
  stance?: string;
  verdict?: string;
  working?: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!isUuid(input.claimId)) return { ok: false as const, message: "That claim is not on the desk." };
  const claim = await db.from("claims").select("id, statement_kind, status").eq("id", input.claimId).maybeSingle();
  if (claim.error || !claim.data) return { ok: false as const, message: "That claim is not on the desk." };
  const kind: StatementKind = claim.data.statement_kind === "opinion" || claim.data.statement_kind === "analysis" ? claim.data.statement_kind : "fact";

  if (input.action === "accept_evidence" || input.action === "reject_evidence") {
    if (!input.evidenceId || !isUuid(input.evidenceId)) return { ok: false as const, message: "Choose an evidence card." };
    const status = input.action === "accept_evidence" ? "accepted" : "rejected";
    const { error } = await db.from("evidence").update({ review_status: status }).eq("id", input.evidenceId).eq("claim_id", input.claimId);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await storeVerdict(input.claimId, kind);
    await recordEvent({ action: status === "accepted" ? "evidence accepted" : "evidence rejected", actor: "editor", subjectType: "evidence", subjectId: input.evidenceId, detail: { claimId: input.claimId } });
    return { ok: true as const };
  }

  if (input.action === "set_tier" || input.action === "set_stance") {
    if (!input.evidenceId || !isUuid(input.evidenceId)) return { ok: false as const, message: "Choose an evidence card." };
    if (input.action === "set_stance") {
      if (!input.stance || !stances.has(input.stance)) return { ok: false as const, message: "Choose how this source relates to the claim." };
      const { error } = await db.from("evidence").update({ stance: input.stance }).eq("id", input.evidenceId).eq("claim_id", input.claimId);
      if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    } else {
      const rank = input.tierRank;
      if (rank !== 1 && rank !== 2 && rank !== 3 && rank !== 4) return { ok: false as const, message: "A source tier is 1 to 4." };
      const evidence = await db.from("evidence").select("source_id").eq("id", input.evidenceId).eq("claim_id", input.claimId).maybeSingle();
      if (!evidence.data?.source_id) return { ok: false as const, message: "That evidence card has no source." };
      const { error } = await db.from("sources").update({ tier_rank: rank }).eq("id", evidence.data.source_id);
      if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    }
    await storeVerdict(input.claimId, kind);
    await recordEvent({ action: "evidence revised", actor: "editor", subjectType: "evidence", subjectId: input.evidenceId, detail: { claimId: input.claimId, action: input.action } });
    return { ok: true as const };
  }

  if (input.action === "set_verdict") {
    if (!input.verdict || !verdicts.has(input.verdict as ProposedVerdict)) return { ok: false as const, message: "That verdict is not one the desk uses." };
    const working = input.working ? sanitizeText(input.working, 2000) : null;
    const { error } = await db
      .from("claims")
      .update({
        proposed_verdict: input.verdict,
        verdict_reasoning: "The editor set this proposed verdict. It is not published.",
        working_notes: working,
      })
      .eq("id", input.claimId);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "verdict revised", actor: "editor", subjectType: "claim", subjectId: input.claimId, detail: { verdict: input.verdict } });
    return { ok: true as const };
  }

  if (input.action === "accept_verdict") {
    const row = await db.from("claims").select("proposed_verdict, verdict_confidence, statement_kind").eq("id", input.claimId).maybeSingle();
    const proposed = row.data?.proposed_verdict;
    const status =
      proposed === "SUPPORTED" ? "verified"
      : proposed === "CONTRADICTED" ? "contradicted"
      : proposed === "NEEDS CONTEXT" || proposed === "MISLEADING" ? "needs_context"
      : proposed === "UNVERIFIED" ? "unverified"
      : null;
    if (!status) return { ok: false as const, message: "There is no proposed verdict to record." };
    if (row.data?.statement_kind === "opinion" && status === "contradicted") {
      return { ok: false as const, message: "An opinion is not recorded as contradicted. #NotTrue is for a factual claim." };
    }
    const { error } = await db.from("claims").update({ status, verification_confidence: row.data?.verdict_confidence ?? "low" }).eq("id", input.claimId);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "verdict recorded", actor: "editor", subjectType: "claim", subjectId: input.claimId, detail: { status } });
    return { ok: true as const };
  }

  if (input.action === "request_more") {
    const { error } = await db.from("claims").update({ status: "researching" }).eq("id", input.claimId);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "more research requested", actor: "editor", subjectType: "claim", subjectId: input.claimId });
    return { ok: true as const };
  }

  return { ok: false as const, message: "That review action is not available." };
}

export async function fileRetrievedEvidence(input: {
  claimId: string;
  pillar: Pillar;
  url: string;
  domain: string;
  title: string;
  organization: string;
  published: string | null;
  passage: string;
  tierRank: number;
  tierName: string;
  notes: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const source = await db
    .from("sources")
    .insert({
      organization: input.organization.slice(0, 120),
      title: input.title.slice(0, 180),
      url: input.url,
      published_label: input.published,
      category: input.tierName,
      reliability: input.tierRank === 1 ? "high" : input.tierRank === 2 ? "substantial" : "moderate",
      retrieved_at: new Date().toISOString(),
      origin: "live",
      domain: input.domain,
      pillar: input.pillar,
      tier_rank: input.tierRank,
    })
    .select("id")
    .single();
  if (source.error || !source.data) return { ok: false as const, message: scrubDbMessage(source.error?.message || "source") };
  const evidence = await db
    .from("evidence")
    .insert({
      claim_id: input.claimId,
      source_id: source.data.id,
      excerpt: input.passage.slice(0, 700),
      stance: "contextualizes",
      review_status: "proposed",
      reliability_notes: input.notes,
      origin: "live",
    })
    .select("id")
    .single();
  if (evidence.error || !evidence.data) return { ok: false as const, message: scrubDbMessage(evidence.error?.message || "evidence") };
  await recordEvent({
    action: "evidence added",
    actor: "editor",
    subjectType: "evidence",
    subjectId: evidence.data.id,
    detail: { claimId: input.claimId, tier: input.tierRank },
  });
  return { ok: true as const, id: evidence.data.id as string };
}

export type { Verdict };
