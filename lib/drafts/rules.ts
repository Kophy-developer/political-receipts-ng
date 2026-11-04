import { characterCount, POST_LIMIT } from "@/lib/format";
import type { EditorReviewPacket } from "@/lib/research/editor-review";

export const DRAFT_UNAVAILABLE = "DRAFT GENERATION UNAVAILABLE";
export const DRAFT_PROMPT_VERSION = "draft-v1";

export const draftStyles = [
  {
    id: "conversational",
    version: "A",
    label: "Conversational",
    brief: "Natural X post. Direct and human.",
  },
  {
    id: "punchy",
    version: "B",
    label: "Punchy",
    brief: "Stronger opening and shorter sentences. It should stop a scroll without becoming clickbait.",
  },
  {
    id: "analytical",
    version: "C",
    label: "Analytical",
    brief: "A little more explanation and reasoning. It still sounds personal.",
  },
  {
    id: "thread",
    version: "D",
    label: "Thread",
    brief: "A short opening post, then a compact thread, when the evidence cannot responsibly fit into one post.",
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
  provider: "gemini" | "editor";
};

export type DraftPiece = {
  style: DraftStyle;
  version: DraftVersion;
  label: string;
  parts: string[];
  text: string;
  hashtag: "#CheckAm" | null;
};

export type DraftProblem = {
  style: string;
  reason: string;
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
};

const forbiddenBody = [
  [/^\s*our investigation found\b/i, "It opens like an institutional report."],
  [/^\s*according to our research\b/i, "It opens like an institutional report."],
  [/^\s*we conducted\b/i, "It opens like an institutional report."],
  [/^\s*fact[\s-]?check\s*:/i, "It opens like a formal fact-check."],
  [/#nottrue\b/i, "This claim does not use #NotTrue."],
  [/\b453 is false\b/i, "The drafts may not call 453 false."],
  [/\bthe (post|claim|allegation) is false\b/i, "The drafts may not call the whole post false."],
  [/\bnever created 453\b/i, "The drafts may not say INEC never created 453 polling units."],
  [/\b(did not|didn't) create 453\b/i, "The drafts may not say INEC did not create 453 polling units."],
  [/\b(lied|lying)\b/i, "The drafts may not say the account lied."],
  [/\bdefinitely voted\b/i, "The drafts may not say AI-generated voters voted."],
  [/\bai-generated voters (have |had )?voted\b/i, "The drafts may not say AI-generated voters voted."],
  [/\bfinal certified register contained\b/i, "The drafts may not put the irregularities in the final certified register."],
  [/\bfinal register contained\b/i, "The drafts may not put the irregularities in the final register."],
  [/\bcriminal organisation\b/i, "The insult about INEC is outside this verdict."],
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
  for (const [pattern, reason] of forbiddenBody) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

function onTopic(text: string) {
  return /photograph|ai-generated|453|voter register|polling unit/i.test(text);
}

export function validateParts(style: DraftStyle, parts: string[]) {
  const cleaned = parts.map((part) => cleanDraftText(part)).filter(Boolean);
  if (cleaned.length === 0) return { ok: false as const, reason: "The draft is empty." };
  if (style === "thread" && (cleaned.length < 2 || cleaned.length > 5)) {
    return { ok: false as const, reason: "A thread needs an opening post and at least one follow-up, and no more than four follow-ups." };
  }
  if (style !== "thread" && style !== "manual" && cleaned.length !== 1) {
    return { ok: false as const, reason: "This style is one post." };
  }
  for (const part of cleaned) {
    const count = characterCount(part);
    if (count > POST_LIMIT) return { ok: false as const, reason: `One post is ${count} characters. The limit is ${POST_LIMIT}.` };
    if (count < 40) return { ok: false as const, reason: "That post is too thin to carry the point." };
  }
  const text = cleaned.join("\n\n");
  const blocked = problemFor(text);
  if (blocked) return { ok: false as const, reason: blocked };
  if (!onTopic(text)) return { ok: false as const, reason: "The draft does not stay on the photographs or the 453 claim." };
  if (style !== "punchy" && style !== "manual" && !/inec/i.test(text)) {
    return { ok: false as const, reason: "This style still needs INEC's response in the wording." };
  }
  if ((style === "conversational" || style === "analytical" || style === "thread") && !/453/.test(text)) {
    return { ok: false as const, reason: "This style still needs the 453 claim, as something the evidence did not establish." };
  }
  return { ok: true as const, parts: cleaned, text };
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

export function judgeModelDrafts(data: unknown, hashtagAlreadyUsed = false): { drafts: DraftPiece[]; problems: DraftProblem[] } {
  const problems: DraftProblem[] = [];
  const drafts: DraftPiece[] = [];
  if (!data || typeof data !== "object") {
    return { drafts, problems: [{ style: "set", reason: "The model reply was not a draft set." }] };
  }
  const record = data as Record<string, unknown>;
  let used = hashtagAlreadyUsed;
  for (const style of draftStyles) {
    const raw = record[style.id];
    if (!raw || typeof raw !== "object") {
      problems.push({ style: style.id, reason: "The model did not return this style." });
      continue;
    }
    const item = raw as { text?: unknown; opening?: unknown; posts?: unknown; hashtag?: unknown };
    const parts = style.id === "thread"
      ? [item.opening, ...(Array.isArray(item.posts) ? item.posts : [])].filter((part): part is string => typeof part === "string")
      : typeof item.text === "string"
        ? [item.text]
        : [];
    const joined = parts.join("\n\n");
    const wanted = hashtagWanted(item.hashtag, joined);
    if (wanted === "blocked") {
      problems.push({ style: style.id, reason: "This claim does not use #NotTrue." });
      continue;
    }
    const stripped = parts.map((part) => stripHashtags(part));
    const checked = validateParts(style.id, stripped);
    if (!checked.ok) {
      problems.push({ style: style.id, reason: checked.reason });
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

export function judgeSavedText(style: string, text: string, hashtagAlreadyUsed: boolean): { ok: true; draft: DraftPiece } | { ok: false; reason: string } {
  const meta = styleMeta(style);
  if (!meta) return { ok: false, reason: "That draft style is not on the desk." };
  if (/#nottrue/i.test(text)) return { ok: false, reason: "This claim does not use #NotTrue." };
  const parts = cleanDraftText(text)
    .split(/\n\s*\n/)
    .map((part) => stripHashtags(part))
    .filter(Boolean);
  const checked = validateParts(meta.id, parts);
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

export function judgeEditorText(text: string, hashtagAlreadyUsed: boolean) {
  return judgeSavedText("manual", text, hashtagAlreadyUsed);
}

export function draftBriefFrom(input: {
  claim: string;
  postText: string;
  verdict: string | null;
  confidence: string | null;
  angle: string | null;
  take: string | null;
  review: EditorReviewPacket | null;
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
    evidence: input.review.sources.map((source) => ({
      kind: source.kind,
      label: source.label,
      note: source.note,
      url: source.url,
    })),
  };
}

export function draftPrompt(brief: DraftBrief, only?: GeneratedStyle) {
  const styles = only ? draftStyles.filter((style) => style.id === only) : draftStyles;
  const evidence = brief.evidence
    .map((source) => `${source.kind.toUpperCase()} — ${source.label}: ${source.note} ${source.url}`)
    .join("\n");
  const system = [
    "You write draft posts for a Nigerian editor who has already checked a claim.",
    "Sound like a person who saw something concerning, checked it, and has something useful to say.",
    "Do not sound like a press release, a newspaper article, a formal fact-check, an AI summary, or a government statement.",
    "Simple English. A natural Nigerian voice is welcome. Do not force Pidgin or slang.",
    "Do not begin with: Our investigation found. According to our research. We conducted. Fact check:",
    "The examples of tone are not mandatory wording: I went looking for the 453. Here's the part that bothers me. This story is already serious enough without adding things we can't prove.",
    "You may say: credible reporting describes suspected AI-generated photographs in the preliminary voter register; INEC responded to the irregularities; we could not establish the 453-polling-unit claim from the evidence reviewed.",
    "You must not say: 453 is false; INEC never created 453 polling units; the account lied; AI-generated voters definitely voted; the final certified register contained those irregularities.",
    "Do not call INEC a criminal organisation. That insult is not part of the verdict.",
    "Recommend #CheckAm. Put it on at most one version. Never use #NotTrue.",
    "Each post, including each thread post, must be 280 characters or fewer.",
    "The four styles must be genuinely different approaches, not paraphrases of one another.",
    "Return only the JSON object described by the schema.",
  ].join(" ");
  const user = [
    `Verdict: ${brief.verdict}. Confidence: ${brief.confidence}.`,
    `Angle: ${brief.angleTitle}.`,
    brief.anglePoints.length ? `Angle notes:\n${brief.anglePoints.map((point) => `- ${point}`).join("\n")}` : "The editor wrote their own angle. Follow the claim and the evidence, and do not invent their opinion.",
    brief.take ? `Editor's take, which you may reflect without widening it: ${brief.take}` : "The editor left My take blank. Do not invent a take and attribute it to them.",
    `Claim on the desk: ${brief.claim}`,
    `Original post, which you must not rewrite or call a lie:\n${brief.postText}`,
    `Evidence already reviewed:\n${evidence}`,
    only
      ? `Write only the ${only} style. ${styles[0]?.brief ?? ""} Make it different from a straight paraphrase of the notes.`
      : `Write all four styles.\n${styles.map((style) => `${style.label}: ${style.brief}`).join("\n")}`,
  ].join("\n\n");
  return { system, user, promptVersion: DRAFT_PROMPT_VERSION };
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
  const thread = {
    type: "OBJECT",
    required: ["opening", "posts"],
    properties: {
      opening: { type: "STRING" },
      posts: { type: "ARRAY", items: { type: "STRING" } },
      hashtag: { type: "STRING" },
    },
  };
  if (only === "thread") return thread;
  if (only) return post;
  return {
    type: "OBJECT",
    required: ["conversational", "punchy", "analytical", "thread"],
    properties: {
      conversational: post,
      punchy: post,
      analytical: post,
      thread,
    },
  };
}

export function savedDraftFields(piece: DraftPiece, input: { provider: "gemini" | "editor"; model: string | null; editorModified: boolean }) {
  return {
    version: piece.version,
    content: piece.text,
    style: piece.style,
    suggested_hashtag: piece.hashtag,
    character_count: characterCount(piece.text),
    ai_provider: input.provider === "gemini" ? "gemini" : null,
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
    },
  };
}
