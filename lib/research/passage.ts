export type StoredPassage = {
  excerpt: string;
  pageLabel: string | null;
};

export type EvidenceRelationship = "supports" | "contradicts" | "contextualizes" | "attribution_only";

export type EvidenceDraft = {
  sourceId: string;
  excerpt: string;
  pageLabel: string | null;
  relationship: EvidenceRelationship;
  reviewStatus: "proposed" | "accepted" | "rejected";
  question: string | null;
  notes: string;
};

const unreadPdf = "The PDF was retrieved. No readable text was extracted, so no passage is stored.";

export const tableExcerptLimit = 4_000;

export function sanitizeStoredText(value: string, max = 1200) {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdfff) continue;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    out += ch;
  }
  out = out.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(out).slice(0, max).join("");
}

export function readableProse(value: string) {
  const letters = value.match(/[A-Za-z]/g)?.length ?? 0;
  return letters >= 12 && letters / Math.max(value.length, 1) >= 0.15;
}

export function prepareStoredPassage(input: { text: string; pageLabel?: string | null; max?: number; empty?: string }): StoredPassage {
  const excerpt = sanitizeStoredText(input.text, input.max ?? 1200);
  const pageLabel = input.pageLabel ? sanitizeStoredText(input.pageLabel, 40) || null : null;
  if (!readableProse(excerpt)) return { excerpt: input.empty || unreadPdf, pageLabel };
  return { excerpt, pageLabel };
}

export function prepareEvidenceDraft(input: {
  sourceId: string;
  text: string;
  pageLabel?: string | null;
  relationship?: EvidenceRelationship;
  reviewStatus?: EvidenceDraft["reviewStatus"];
  question?: string | null;
  notes: string;
  empty?: string;
}): EvidenceDraft {
  const table = /^\s*Source URL:/m.test(input.text) && input.text.includes("\nSeries:");
  const passage = prepareStoredPassage({ text: input.text, pageLabel: input.pageLabel, empty: input.empty, max: table ? tableExcerptLimit : undefined });
  return {
    sourceId: input.sourceId,
    excerpt: passage.excerpt,
    pageLabel: passage.pageLabel,
    relationship: input.relationship ?? "contextualizes",
    reviewStatus: input.reviewStatus ?? "proposed",
    question: input.question ? sanitizeStoredText(input.question, 400) || null : null,
    notes: sanitizeStoredText(input.notes, 500),
  };
}

export function draftIsStorable(draft: EvidenceDraft) {
  const fields = [draft.excerpt, draft.notes, draft.question ?? "", draft.pageLabel ?? ""];
  return fields.every((field) => !field.includes("\u0000") && ![...field].some((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 0xd800 && code <= 0xdfff;
  }));
}
