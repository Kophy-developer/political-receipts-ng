import "server-only";
import { recordEvent } from "@/lib/db/events";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";
import { proposeVerdict } from "@/lib/research/verdict";
import { inferClaimTypes, questionsFor } from "@/lib/research/claim-types";
import type { Pillar, StatementKind } from "@/lib/research/types";
import { proposeOpportunities, type OpportunityPost } from "@/lib/opportunities/rules";
import { opportunityTypes, type OpportunityAngle, type OpportunityCard, type OpportunityProposal, type OpportunityScore, type OpportunityType, type ResearchNeed } from "@/lib/opportunities/types";
import { publicPostUrl, sanitizeText } from "@/lib/intel/text";

const needs = new Set<ResearchNeed>(["yes", "recommended", "no"]);
const scores = new Set<OpportunityScore>(["high", "medium", "low"]);
const pillars = new Set<Pillar>(["politics", "football", "finance"]);

function voiceFor(type: OpportunityType): OpportunityProposal["voice"] {
  if (type === "check") return "fact";
  if (type === "analysis" || type === "original_insight") return "analysis";
  if (type === "humour") return "humour";
  if (type === "reaction") return "opinion";
  return "opinion";
}

export async function reviewStoredConversations() {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const posts = await db.from("x_posts").select("conversation_id, text, username, x_post_id").not("conversation_id", "is", null);
  if (posts.error) return { ok: false as const, message: scrubDbMessage(posts.error.message) };
  const grouped = new Map<string, OpportunityPost[]>();
  for (const row of posts.data ?? []) {
    if (typeof row.conversation_id !== "string" || typeof row.text !== "string") continue;
    const list = grouped.get(row.conversation_id) ?? [];
    list.push({ text: row.text, username: typeof row.username === "string" ? row.username : null });
    grouped.set(row.conversation_id, list);
  }
  const counts: Record<OpportunityType, number> = { reaction: 0, opinion: 0, check: 0, analysis: 0, original_insight: 0, humour: 0, question: 0 };
  const scoreCounts = { high: 0, medium: 0, low: 0 };
  const researchCounts = { yes: 0, recommended: 0, no: 0 };
  let filed = 0;
  let quiet = 0;
  for (const [conversationId, conversationPosts] of grouped) {
    const reading = proposeOpportunities(conversationPosts);
    await db.from("opportunity_reviews").insert({
      conversation_id: conversationId,
      model_status: "unavailable",
      rules_status: reading.worthSaying ? "filed" : "nothing_to_say",
      note: `Opportunity analysis unavailable. ${reading.note}`,
    });
    if (!reading.worthSaying) {
      quiet += 1;
      continue;
    }
    const existing = await db.from("opportunities").select("opportunity_type").eq("conversation_id", conversationId).eq("source", "rules");
    const have = new Set((existing.data ?? []).map((row) => row.opportunity_type));
    for (const proposal of reading.proposals) {
      if (have.has(proposal.type)) continue;
      const inserted = await db.from("opportunities").insert(rowFrom(proposal, conversationId, "rules")).select("id").single();
      if (inserted.error || !inserted.data) continue;
      counts[proposal.type] += 1;
      scoreCounts[proposal.score] += 1;
      researchCounts[proposal.research] += 1;
      filed += 1;
      await recordEvent({
        action: "opportunity filed",
        actor: "desk",
        subjectType: "opportunity",
        subjectId: inserted.data.id,
        detail: { type: proposal.type, source: "rules", research: proposal.research },
      });
    }
  }
  return { ok: true as const, conversations: grouped.size, filed, quiet, counts, scoreCounts, researchCounts, model: "not_called" as const, xRequests: 0, searches: 0 };
}

function rowFrom(proposal: OpportunityProposal, conversationId: string | null, source: "rules" | "manual") {
  return {
    conversation_id: conversationId,
    content_pillar: "politics",
    opportunity_type: proposal.type,
    research_required: proposal.research,
    score: proposal.score,
    score_reason: proposal.scoreReason,
    what_happened: proposal.whatHappened,
    why_interesting: proposal.whyInteresting,
    what_could_add: proposal.whatCouldAdd,
    angles: proposal.angles,
    research_questions: proposal.questions,
    voice: proposal.voice,
    status: "open",
    source,
    origin: "live",
  };
}

export async function createManualOpportunity(input: {
  conversationId: string;
  type: string;
  research: string;
  score: string;
  whatHappened: string;
  whyInteresting: string;
  whatCouldAdd: string;
  pillar: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!opportunityTypes.includes(input.type as OpportunityType)) return { ok: false as const, message: "Choose a content type." };
  if (!needs.has(input.research as ResearchNeed)) return { ok: false as const, message: "Say whether research is needed." };
  if (!scores.has(input.score as OpportunityScore)) return { ok: false as const, message: "Choose a score." };
  if (input.pillar && !pillars.has(input.pillar as Pillar)) return { ok: false as const, message: "Choose a pillar." };
  const type = input.type as OpportunityType;
  const what = sanitizeText(input.whatHappened, 400);
  const why = sanitizeText(input.whyInteresting, 400);
  const add = sanitizeText(input.whatCouldAdd, 400);
  if (what.length < 12 || why.length < 12 || add.length < 12) return { ok: false as const, message: "Each of the three notes needs a full sentence." };
  let conversationId: string | null = null;
  if (input.conversationId.trim()) {
    if (!isUuid(input.conversationId.trim())) return { ok: false as const, message: "That conversation is not on the desk." };
    conversationId = input.conversationId.trim();
  }
  const proposal: OpportunityProposal = {
    type,
    research: input.research as ResearchNeed,
    score: input.score as OpportunityScore,
    scoreReason: "Scored by the editor. This card was filed by hand.",
    whatHappened: what,
    whyInteresting: why,
    whatCouldAdd: add,
    angles: [],
    questions: type === "check" ? ["What record would confirm or contradict the factual sentence?"] : [],
    voice: voiceFor(type),
  };
  const { data, error } = await db.from("opportunities").insert({ ...rowFrom(proposal, conversationId, "manual"), content_pillar: input.pillar || "politics" }).select("id").single();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "opportunity") };
  await recordEvent({ action: "opportunity filed", actor: "editor", subjectType: "opportunity", subjectId: data.id, detail: { type, source: "manual" } });
  return { ok: true as const, id: data.id as string };
}

export async function decideOpportunity(input: { id: string; action: string; angle?: string; take?: string }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!isUuid(input.id)) return { ok: false as const, message: "That opportunity is not on the desk." };
  const row = await db.from("opportunities").select("id, status, conversation_id, what_happened, research_questions, angles, opportunity_type, voice, content_pillar, research_required").eq("id", input.id).maybeSingle();
  if (row.error || !row.data) return { ok: false as const, message: "That opportunity is not on the desk." };
  if (input.action === "ignore" || input.action === "save") {
    const status = input.action === "ignore" ? "ignored" : "saved";
    const { error } = await db.from("opportunities").update({ status }).eq("id", input.id);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "opportunity decided", actor: "editor", subjectType: "opportunity", subjectId: input.id, detail: { status } });
    return { ok: true as const, message: status === "ignored" ? "Set aside." : "Saved for later." };
  }
  if (input.action === "talk") {
    const angle = sanitizeText(input.angle ?? "", 160);
    const take = sanitizeText(input.take ?? "", 500);
    if (!angle && !take) return { ok: false as const, message: "Choose an angle or write your take. The desk will not invent one." };
    const { error } = await db.from("opportunities").update({ status: "talk", editor_angle: angle || null, editor_take: take || null }).eq("id", input.id);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "opportunity decided", actor: "editor", subjectType: "opportunity", subjectId: input.id, detail: { status: "talk" } });
    return { ok: true as const, message: "Your take is filed. Nothing was drafted for you, and nothing was posted." };
  }
  if (input.action === "research") {
    const sent = await sendToResearch(row.data, sanitizeText(input.angle ?? "", 160));
    return sent;
  }
  return { ok: false as const, message: "That decision is not available." };
}

async function sendToResearch(row: {
  id: string;
  conversation_id: string | null;
  what_happened: string;
  research_questions: string[] | null;
  angles: unknown;
  opportunity_type: string;
  voice: string;
  content_pillar: string;
}, angleTitle: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const angles = Array.isArray(row.angles) ? (row.angles as OpportunityAngle[]) : [];
  const chosen = angles.find((item) => item.title === angleTitle);
  const questions = (chosen?.questions?.length ? chosen.questions : row.research_questions ?? []).slice(0, 4);
  if (questions.length === 0 && row.opportunity_type !== "check") {
    questions.push("Is there a factual sentence here, or only a view?");
  }
  const pillar: Pillar = row.content_pillar === "football" || row.content_pillar === "finance" ? row.content_pillar : "politics";
  const kind: StatementKind = row.voice === "analysis" ? "analysis" : row.voice === "fact" ? "fact" : "opinion";
  const claimText = sanitizeText(row.what_happened, 500);
  const types = inferClaimTypes(claimText, pillar);
  const post = row.conversation_id
    ? await db.from("x_posts").select("x_post_id, username, text").eq("conversation_id", row.conversation_id).limit(1).maybeSingle()
    : { data: null };
  const verdict = proposeVerdict({ statementKind: kind, evidence: [] });
  const claim = await db.from("claims").insert({
    claim_text: claimText,
    conversation_id: row.conversation_id,
    original_post_id: post.data?.x_post_id ?? null,
    original_post_url: post.data ? publicPostUrl(post.data.x_post_id, post.data.username) : null,
    original_author_username: post.data?.username ?? null,
    original_post_text: post.data?.text ?? null,
    detected_at: new Date().toISOString(),
    origin: "live",
    status: "new",
    content_pillar: pillar,
    statement_kind: kind,
    claim_types: types,
    research_questions: questions.length ? questions : questionsFor(types, pillar).map((item) => item.question).slice(0, 4),
    proposed_verdict: verdict.factual,
    verdict_reasoning: verdict.reasoning,
    verdict_caveats: verdict.caveats,
    verdict_unknown: verdict.unknown,
    verdict_confidence: verdict.confidence,
    attribution_note: verdict.attribution,
    editor_notes: angleTitle ? `Angle: ${angleTitle}` : "Sent from an opportunity. Research is not started.",
  }).select("id").single();
  if (claim.error || !claim.data) return { ok: false as const, message: scrubDbMessage(claim.error?.message || "claim") };
  await db.from("opportunities").update({ status: "research", claim_id: claim.data.id, editor_angle: angleTitle || null }).eq("id", row.id);
  await recordEvent({ action: "research sent", actor: "editor", subjectType: "opportunity", subjectId: row.id, detail: { claimId: claim.data.id } });
  return { ok: true as const, message: "A dossier is open. Research has not started.", claimId: claim.data.id as string };
}

export async function listOpportunityDesk() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const [cards, reviews, conversations] = await Promise.all([
    db.from("opportunities").select("id, conversation_id, claim_id, opportunity_type, research_required, score, score_reason, what_happened, why_interesting, what_could_add, angles, research_questions, voice, status, editor_angle, editor_take, source, conversations ( title )").order("created_at", { ascending: false }),
    db.from("opportunity_reviews").select("conversation_id, model_status, rules_status, note, created_at").order("created_at", { ascending: false }).limit(40),
    db.from("conversations").select("id, title, status").order("started_at", { ascending: false }),
  ]);
  if (cards.error) return { ok: false as const, reason: "unreachable" as const, message: scrubDbMessage(cards.error.message) };
  const items: OpportunityCard[] = (cards.data ?? []).map((row) => {
    const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
    return {
      id: row.id as string,
      conversationId: row.conversation_id,
      conversationTitle: conversation?.title ?? null,
      type: row.opportunity_type,
      research: row.research_required,
      score: row.score,
      scoreReason: row.score_reason,
      whatHappened: row.what_happened,
      whyInteresting: row.why_interesting,
      whatCouldAdd: row.what_could_add,
      angles: Array.isArray(row.angles) ? (row.angles as OpportunityAngle[]) : [],
      questions: row.research_questions ?? [],
      voice: row.voice,
      status: row.status,
      editorAngle: row.editor_angle,
      editorTake: row.editor_take,
      source: row.source,
      claimId: row.claim_id,
    };
  });
  return {
    ok: true as const,
    items,
    reviews: reviews.data ?? [],
    conversations: (conversations.data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, status: row.status as string })),
  };
}
