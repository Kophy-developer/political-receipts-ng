import { characterCount, POST_LIMIT } from "@/lib/format";
import { isPollingUnitStory, legacyPollingLines, legacyTopicProblem, legacyWordingProblem } from "@/lib/drafts/legacy-polling";
import { contentPillarFromStorage, maySuggestEditorialTag, pillarVoice, researchSources } from "@/lib/pillars/catalog";
import type { FailureKind } from "@/lib/research/relevance";
import type { EditorReviewPacket } from "@/lib/research/editor-review";

export const DRAFT_UNAVAILABLE = "DRAFT GENERATION UNAVAILABLE";
export const DRAFT_PROMPT_VERSION = "draft-v2";

export const draftStyles = [
  {
    id: "conversational",
    version: "A",
    label: "Conversational",
    brief: "The observation, in one post or two. A second post is for the point, not for a source list.",
  },
  {
    id: "punchy",
    version: "B",
    label: "Punchy",
    brief: "One short post. The observation, then stop.",
  },
  {
    id: "analytical",
    version: "C",
    label: "Analytical",
    brief: "A little more of the reasoning, still as a person talking. One post, or two if the thought needs the room.",
  },
  {
    id: "thread",
    version: "D",
    label: "Thread",
    brief: "Only when the story actually needs a sequence. Otherwise the model says the thread is not needed.",
  },
] as const;

export const manualStyle = {
  id: "manual",
  version: "M",
  label: "Your version",
  brief: "Written by the editor. No model is asked to produce it.",
} as const;

export type GeneratedStyle = (typeof draftStyles)[number]["id"];
export type DraftStyle = GeneratedStyle | "manual";
export type DraftVersion = "A" | "B" | "C" | "D" | "M";

export type StoredDraft = {
  id: string;
  style: string;
  version: string;
  label: string;
  text: string;
  parts: string[];
  hashtag: "#CheckAm" | null;
  selected: boolean;
  editorModified: boolean;
  status: string;
  provider: "groq" | "openrouter" | "gemini" | "editor";
};

export type DraftPiece = {
  style: DraftStyle;
  version: DraftVersion;
  label: string;
  parts: string[];
  text: string;
  hashtag: "#CheckAm" | null;
};

export type DraftRules = "legacy" | "general";

export type DraftProblem = {
  style: string;
  reason: string;
  kind?: FailureKind;
};

export type DraftBrief = {
  claim: string;
  postText: string;
  verdict: string;
  confidence: string;
  angleTitle: string;
  anglePoints: string[];
  take: string | null;
  evidence: Array<{ kind: string; label: string; note: string; url: string }>;
  contentPillar?: "politics" | "football" | "finance" | null;
  attribution?: string;
  interpretation?: string;
  premises?: string[];
  limitations?: string;
};

const genericForbidden = [
  [/^\s*our investigation found\b/i, "It opens like an institutional report."],
  [/^\s*according to our research\b/i, "It opens like an institutional report."],
  [/^\s*we conducted\b/i, "It opens like an institutional report."],
  [/^\s*fact[\s-]?check\s*:/i, "It opens like a formal fact-check."],
  [/#nottrue\b/i, "This claim does not use #NotTrue."],
  [/\bthe (post|claim|allegation) is false\b/i, "The drafts may not call the whole post false."],
  [/\b(lied|lying)\b/i, "The drafts may not say the account lied."],
  [/\b(we verified|we confirmed|the record proves|this is confirmed)\b/i, "The drafts may not announce a verdict the desk has not accepted."],
] as const;

export function styleMeta(style: string) {
  if (style === manualStyle.id) return manualStyle;
  return draftStyles.find((item) => item.id === style) ?? null;
}

export function cleanDraftText(input: string) {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function stripHashtags(input: string) {
  return cleanDraftText(input.replace(/#checkam\b/gi, "").replace(/#nottrue\b/gi, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"));
}

function problemFor(text: string) {
  for (const [pattern, reason] of genericForbidden) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

export function isSourcePost(part: string) {
  const lines = part.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^https:\/\/\S+$/.test(line));
}

function splitSource(parts: string[]) {
  if (parts.length < 2) return { body: parts, source: null as string | null };
  const last = parts[parts.length - 1] ?? "";
  if (!isSourcePost(last)) return { body: parts, source: null };
  return { body: parts.slice(0, -1), source: last };
}

export function appendSourcePost(text: string, raw: string) {
  const links = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (links.length === 0) return { ok: true as const, text };
  if (links.length > 4) return { ok: false as const, reason: "Attach at most four source links." };
  if (links.some((link) => !/^https:\/\/\S+$/.test(link))) return { ok: false as const, reason: "Source links have to be https URLs, one per line." };
  const post = links.join("\n");
  if (characterCount(post) > POST_LIMIT) return { ok: false as const, reason: "Those links do not fit in one follow-up post." };
  return { ok: true as const, text: `${cleanDraftText(text)}\n\n${post}` };
}

export function validateParts(style: DraftStyle, parts: string[], rules: DraftRules = "legacy") {
  const cleaned = parts.map((part) => cleanDraftText(part)).filter(Boolean);
  if (cleaned.length === 0) return { ok: false as const, reason: "The draft is empty.", kind: "invalid draft structure" as const };
  const { body, source } = splitSource(cleaned);
  if (body.length === 0) return { ok: false as const, reason: "The draft is empty.", kind: "invalid draft structure" as const };
  if (source && characterCount(source) > POST_LIMIT) {
    return { ok: false as const, reason: `The source post is ${characterCount(source)} characters. The limit is ${POST_LIMIT}.`, kind: "invalid draft structure" as const };
  }
  if (style === "thread" && (body.length < 2 || body.length > (source ? 4 : 5))) {
    return { ok: false as const, reason: "A thread needs an opening post and at least one follow-up, and no more than four follow-ups.", kind: "invalid draft structure" as const };
  }
  if (style === "punchy" && body.length !== 1) return { ok: false as const, reason: "Punchy stays one post.", kind: "invalid draft structure" as const };
  if ((style === "conversational" || style === "analytical") && (body.length < 1 || body.length > 2)) {
    return { ok: false as const, reason: "This style is one post, or two when the point needs the room.", kind: "invalid draft structure" as const };
  }
  for (const part of body) {
    const count = characterCount(part);
    if (count > POST_LIMIT) return { ok: false as const, reason: `One post is ${count} characters. The limit is ${POST_LIMIT}.`, kind: "invalid draft structure" as const };
    if (count < 40) {
      const reason = style === "thread"
        ? "A thread post is under 40 characters. That stub was not saved. A thread that is not needed should be marked THREAD_NOT_NEEDED instead."
        : "That post is too thin to carry the point.";
      return { ok: false as const, reason, kind: "invalid draft structure" as const };
    }
  }
  const text = body.join("\n\n");
  const blocked = problemFor(text);
  if (blocked) {
    const kind: FailureKind = /empty|characters|too thin|stub/i.test(blocked) ? "invalid draft structure" : "unsupported statement";
    return { ok: false as const, reason: blocked, kind };
  }
  if (rules === "legacy") {
    const story = legacyWordingProblem(text) ?? legacyTopicProblem(style, text);
    if (story) return { ok: false as const, reason: story, kind: "story-specific validation" as const };
  }
  return { ok: true as const, parts: cleaned, text: cleaned.join("\n\n") };
}

function tokens(text: string) {
  return new Set(
    stripHashtags(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
}

export function similarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 1;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function tooSimilar(left: string, right: string) {
  return similarity(left, right) >= 0.72;
}

function hashtagWanted(value: unknown, text: string) {
  if (typeof value === "string" && /#nottrue/i.test(value)) return "blocked" as const;
  if (/#nottrue/i.test(text)) return "blocked" as const;
  if (typeof value === "string" && /#checkam/i.test(value)) return "yes" as const;
  if (/#checkam/i.test(text)) return "yes" as const;
  return "no" as const;
}

export function threadDecision(raw: unknown) {
  if (raw == null) return { kind: "skip" as const, reason: "The model did not include a thread." };
  if (typeof raw !== "object") return { kind: "missing" as const };
  const item = raw as { needed?: unknown; reason?: unknown; opening?: unknown; posts?: unknown; text?: unknown };
  if (item.needed === false) {
    const reason = typeof item.reason === "string" && item.reason.trim()
      ? item.reason.trim().replace(/\s+/g, " ").slice(0, 180)
      : "The model marked the thread as unnecessary.";
    return { kind: "skip" as const, reason };
  }
  const hasWriting = typeof item.opening === "string" || Array.isArray(item.posts) || typeof item.text === "string";
  if (!hasWriting) return { kind: "skip" as const, reason: "The model did not write a thread." };
  return { kind: "write" as const };
}

export type VoiceNote = {
  originalText: string;
  finalText: string;
  provider: "groq" | "openrouter" | "gemini";
  model: string | null;
  style: string;
  angle: string | null;
  verdict: string | null;
  editedAt: string;
};

function aiProvider(value: string | null): VoiceNote["provider"] | null {
  if (value === "groq" || value === "openrouter" || value === "gemini") return value;
  return null;
}

/** Keeps the first model wording beside the editor's later version. Nothing here trains a model. */
export function nextVoiceNote(input: {
  existingVoice: VoiceNote | null;
  existingText: string;
  existingProvider: string | null;
  existingModel: string | null;
  style: string;
  finalText: string;
  angle: string | null;
  verdict: string | null;
  editedAt: string;
}): VoiceNote | null {
  if (input.existingVoice) {
    return { ...input.existingVoice, finalText: input.finalText, editedAt: input.editedAt };
  }
  const provider = aiProvider(input.existingProvider);
  if (!provider) return null;
  return {
    originalText: input.existingText,
    finalText: input.finalText,
    provider,
    model: input.existingModel,
    style: input.style,
    angle: input.angle,
    verdict: input.verdict,
    editedAt: input.editedAt,
  };
}

function pieceFrom(style: DraftStyle, parts: string[], hashtag: "#CheckAm" | null): DraftPiece {
  const meta = styleMeta(style);
  return {
    style,
    version: meta?.version ?? "M",
    label: meta?.label ?? "Draft",
    parts,
    text: parts.join("\n\n"),
    hashtag,
  };
}

export function judgeModelDrafts(data: unknown, hashtagAlreadyUsed = false, rules: DraftRules = "legacy"): { drafts: DraftPiece[]; problems: DraftProblem[] } {
  const problems: DraftProblem[] = [];
  const drafts: DraftPiece[] = [];
  if (!data || typeof data !== "object") {
    return { drafts, problems: [{ style: "set", reason: "The model reply was not a draft set." }] };
  }
  const record = data as Record<string, unknown>;
  let used = hashtagAlreadyUsed;
  for (const style of draftStyles) {
    const raw = record[style.id];
    if (style.id === "thread") {
      const decision = threadDecision(raw);
      if (decision.kind === "skip") {
        problems.push({ style: style.id, reason: `THREAD_NOT_NEEDED. ${decision.reason}` });
        continue;
      }
    }
    if (!raw || typeof raw !== "object") {
      problems.push({ style: style.id, reason: "The model did not return this style." });
      continue;
    }
    const item = raw as { text?: unknown; opening?: unknown; posts?: unknown; hashtag?: unknown };
    const parts = style.id === "thread"
      ? [item.opening, ...(Array.isArray(item.posts) ? item.posts : [])].filter((part): part is string => typeof part === "string")
      : Array.isArray(item.posts) && item.posts.every((part) => typeof part === "string")
        ? item.posts
        : typeof item.text === "string"
          ? item.text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
          : [];
    const joined = parts.join("\n\n");
    const wanted = hashtagWanted(item.hashtag, joined);
    if (wanted === "blocked") {
      problems.push({ style: style.id, reason: "This claim does not use #NotTrue." });
      continue;
    }
    const stripped = parts.map((part) => stripHashtags(part));
    const checked = validateParts(style.id, stripped, rules);
    if (!checked.ok) {
      problems.push({ style: style.id, reason: checked.reason, kind: checked.kind });
      continue;
    }
    let nextParts = checked.parts;
    let hashtag: "#CheckAm" | null = null;
    if (wanted === "yes" && !used) {
      const last = nextParts.length - 1;
      const tagged = `${nextParts[last]}\n\n#CheckAm`;
      if (characterCount(tagged) <= POST_LIMIT) {
        nextParts = nextParts.slice();
        nextParts[last] = tagged;
        hashtag = "#CheckAm";
        used = true;
      }
    }
    const text = nextParts.join("\n\n");
    const twin = drafts.find((draft) => tooSimilar(draft.text, text));
    if (twin) {
      problems.push({ style: style.id, reason: `${style.label} repeated ${twin.label}. It was not saved.` });
      continue;
    }
    drafts.push(pieceFrom(style.id, nextParts, hashtag));
  }
  return { drafts, problems };
}

export function judgeSavedText(style: string, text: string, hashtagAlreadyUsed: boolean, rules: DraftRules = "legacy"): { ok: true; draft: DraftPiece } | { ok: false; reason: string } {
  const meta = styleMeta(style);
  if (!meta) return { ok: false, reason: "That draft style is not on the desk." };
  if (/#nottrue/i.test(text)) return { ok: false, reason: "This claim does not use #NotTrue." };
  const parts = cleanDraftText(text)
    .split(/\n\s*\n/)
    .map((part) => stripHashtags(part))
    .filter(Boolean);
  const checked = validateParts(meta.id, parts, rules);
  if (!checked.ok) return checked;
  let nextParts = checked.parts;
  let hashtag: "#CheckAm" | null = null;
  if (/#checkam/i.test(text) && !hashtagAlreadyUsed) {
    const last = nextParts.length - 1;
    const tagged = `${nextParts[last]}\n\n#CheckAm`;
    if (characterCount(tagged) <= POST_LIMIT) {
      nextParts = nextParts.slice();
      nextParts[last] = tagged;
      hashtag = "#CheckAm";
    }
  }
  return { ok: true, draft: pieceFrom(meta.id, nextParts, hashtag) };
}

export function judgeEditorText(text: string, hashtagAlreadyUsed: boolean, rules: DraftRules = "legacy") {
  return judgeSavedText("manual", text, hashtagAlreadyUsed, rules);
}

export function draftBriefFrom(input: {
  claim: string;
  postText: string;
  verdict: string | null;
  confidence: string | null;
  angle: string | null;
  take: string | null;
  review: EditorReviewPacket | null;
  pillar?: "politics" | "football" | "finance" | null;
}): DraftBrief | null {
  if (!input.review) return null;
  const angle = input.review.angles.find((item) => item.id === input.angle) ?? null;
  const angleTitle = input.angle === "own" ? "The editor's own angle" : angle?.title ?? "";
  const anglePoints = input.angle === "own" ? [] : angle?.points ?? [];
  if (!angleTitle) return null;
  return {
    claim: input.claim,
    postText: input.postText,
    verdict: input.verdict || input.review.proposedVerdict,
    confidence: input.confidence || "Moderate",
    angleTitle,
    anglePoints,
    take: input.take,
    contentPillar: input.pillar ?? null,
    evidence: input.review.sources.map((source) => ({
      kind: source.kind,
      label: source.label,
      note: source.note,
      url: source.url,
    })),
  };
}

function pillarVoiceLines(value: DraftBrief["contentPillar"]) {
  const pillar = contentPillarFromStorage(value);
  if (!pillar) return [];
  const tag = maySuggestEditorialTag(pillar)
    ? "An editorial hashtag is optional. Do not add one unless the post is using that tool."
    : "Do not add #CheckAm, #ShowYourWorking, or #NotTrue.";
  return [pillarVoice[pillar], researchSources[pillar], tag];
}

export function draftPrompt(brief: DraftBrief, only?: GeneratedStyle, includeLegacy = isPollingUnitStory(`${brief.claim}\n${brief.postText}`)) {
  const styles = only ? draftStyles.filter((style) => style.id === only) : draftStyles;
  const evidence = brief.evidence
    .map((source) => `${source.kind.toUpperCase()} — ${source.label}: ${source.note} ${source.url}`)
    .join("\n");
  const system = [
    "You draft a post the editor might publish on X, as their own thought.",
    "Hierarchy: the selected angle, then the natural argument, then only the evidence that holds that argument up, then the landing. Do not list findings, then sources, then a verdict.",
    "Answer what is interesting to say. Do not answer what the research file contained.",
    "Sound like a person on X. Fragments are fine. Rhythm can change. A rhetorical question is fine. Mild humour is fine when it stays fair. Be strong only where the point can stand.",
    "Do not write a compressed fact-check or a bibliography. Do not force a source name into every post. Evidence can sit under the sentence without naming every outlet.",
    "Do not put URLs in the draft. The editor attaches sources later, including on a #CheckAm follow-up.",
    "Do not invent a source, a figure, or a verdict. Do not forecast an election. Keep a quoted or attributed claim with the speaker the post names.",
    "If the evidence does not settle the point, say what is unresolved. Do not write as if it were confirmed.",
    "Do not open with: Our investigation found. According to our research. We conducted. Fact check:",
    ...(includeLegacy ? legacyPollingLines() : []),
    "#CheckAm on at most one version.",
    "Each post is at most 280 characters. Do not ruin a clear thought just to stay inside one post.",
    "Conversational and analytical may be one post, or two posts separated by a blank line. Punchy is one short post. A thread exists only when the story needs the sequence. If it does not, set thread.needed to false and give a short reason. Do not send a stub thread.",
    "The styles are different ways into the same angle, not four paraphrases.",
    "Return only the JSON object described by the schema.",
    ...pillarVoiceLines(brief.contentPillar),
  ].join(" ");
  const user = [
    `Selected angle: ${brief.angleTitle}. This angle drives the writing.`,
    brief.anglePoints.length ? `What the angle is holding:\n${brief.anglePoints.map((point) => `- ${point}`).join("\n")}` : "The editor wrote their own angle. Follow that, and do not invent an opinion they did not write.",
    brief.take ? `Editor's take, which you may reflect without widening it: ${brief.take}` : "The editor left My take blank. Do not invent a take and attribute it to them.",
    `Verdict already chosen, for your restraint, not as a label to announce: ${brief.verdict}. Confidence: ${brief.confidence}.`,
    `Claim, as context rather than an outline: ${brief.claim}`,
    `Original post. Leave it alone:\n${brief.postText}`,
    `Support you may use. Do not dump it:\n${evidence}`,
    only
      ? `Write only the ${only} style. ${styles[0]?.brief ?? ""}`
      : `Write the styles below.\n${styles.map((style) => `${style.label}: ${style.brief}`).join("\n")}`,
  ].join("\n\n");
  return { system, user, promptVersion: includeLegacy ? DRAFT_PROMPT_VERSION : "draft-v3" };
}

/** Development drafts are briefed from the current post. The polling-unit instructions are not added. */
export function developmentDraftPrompt(brief: DraftBrief & {
  attribution: string;
  interpretation: string;
  premises: string[];
  limitations: string;
}, only?: GeneratedStyle) {
  const base = draftPrompt({
    ...brief,
    claim: brief.premises.join(" ") || brief.claim,
  }, only, false);
  const user = [
    `Original post:\n${brief.postText}`,
    `Attribution: ${brief.attribution}`,
    `Corrected reading: ${brief.interpretation}`,
    brief.premises.length ? `Factual premises:\n${brief.premises.map((premise) => `- ${premise}`).join("\n")}` : "No separate factual premise was extracted.",
    `Selected angle: ${brief.angleTitle}`,
    brief.anglePoints.length ? brief.anglePoints.map((point) => `- ${point}`).join("\n") : "",
    `Unresolved limitation: ${brief.limitations}`,
    base.user,
  ].filter(Boolean).join("\n\n");
  return { ...base, user, promptVersion: "develop-v1" };
}

export function draftSchema(only?: GeneratedStyle) {
  const post = {
    type: "OBJECT",
    required: ["text"],
    properties: {
      text: { type: "STRING" },
      hashtag: { type: "STRING" },
    },
  };
  const optionalThread = {
    type: "OBJECT",
    properties: {
      needed: { type: "BOOLEAN" },
      reason: { type: "STRING" },
      opening: { type: "STRING" },
      posts: { type: "ARRAY", items: { type: "STRING" } },
      hashtag: { type: "STRING" },
    },
  };
  if (only === "thread") return optionalThread;
  if (only) return post;
  return {
    type: "OBJECT",
    required: ["conversational", "punchy", "analytical"],
    properties: {
      conversational: post,
      punchy: post,
      analytical: post,
      thread: optionalThread,
    },
  };
}

export function savedDraftFields(piece: DraftPiece, input: { provider: "groq" | "openrouter" | "gemini" | "editor"; model: string | null; editorModified: boolean; sourceHash?: string | null }) {
  return {
    version: piece.version,
    content: piece.text,
    style: piece.style,
    suggested_hashtag: piece.hashtag,
    character_count: characterCount(piece.text),
    ai_provider: input.provider === "editor" ? null : input.provider,
    ai_model: input.model,
    status: "draft" as const,
    editor_modified: input.editorModified,
    origin: "live" as const,
    generation_metadata: {
      source: "editor-draft",
      holdReason: "Saved on the claim. Publishing is a separate action.",
      parts: piece.parts,
      hashtag: piece.hashtag,
      provider: input.provider,
      promptVersion: DRAFT_PROMPT_VERSION,
      ...(input.sourceHash ? { sourceHash: input.sourceHash } : {}),
    },
  };
}
