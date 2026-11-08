export const rephraseLimit = 280;

export type RephraseInput = {
  text: string;
  instruction: string;
  claim?: string;
  caveats?: string[];
};

export function parseRephraseRequest(input: { text?: unknown; instruction?: unknown; claim?: unknown; caveats?: unknown }): { ok: true; value: RephraseInput } | { ok: false; message: string } {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const instruction = typeof input.instruction === "string" ? input.instruction.trim() : "";
  if (!text) return { ok: false, message: "There is no draft to rephrase." };
  if (!instruction) return { ok: false, message: "Say or type how you want this rewritten." };
  if (instruction.length > 500) return { ok: false, message: "Keep the instruction under 500 characters." };
  if (text.length > 8_000) return { ok: false, message: "That draft is too long to send for a rewrite." };
  const claim = typeof input.claim === "string" ? input.claim.trim().slice(0, 500) : "";
  const caveats = Array.isArray(input.caveats)
    ? input.caveats.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 240)] : [])).slice(0, 6)
    : [];
  return { ok: true, value: { text, instruction, claim: claim || undefined, caveats } };
}

export function rephraseSystemPrompt() {
  return [
    "You rewrite one social post for Political Receipts NG.",
    "Return JSON only: {\"text\":\"...\"}.",
    "Keep the factual numbers, years, units, and caveats that are already in the draft unless the instruction asks to cut them.",
    "Do not invent new statistics, sources, quotes, or causes.",
    "Do not add hashtags unless the instruction asks for them.",
    "Do not sound more certain than the draft.",
    `Prefer a single post at or under ${rephraseLimit} characters when that still obeys the instruction.`,
  ].join(" ");
}

export function rephraseUserPrompt(input: RephraseInput) {
  const lines = [
    "Current draft:",
    input.text,
    "",
    `Editor instruction: ${input.instruction}`,
  ];
  if (input.claim) {
    lines.push("", `Source claim context: ${input.claim}`);
  }
  if (input.caveats?.length) {
    lines.push("", "Caveats that should survive unless the instruction removes them:");
    for (const line of input.caveats) lines.push(`- ${line}`);
  }
  lines.push("", `Reply with JSON {"text":"..."} only. Keep the rewritten post within ${rephraseLimit} characters when possible.`);
  return lines.join("\n");
}

export const rephraseSchema = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string" },
  },
} as const;

export const rephraseGeminiSchema = {
  type: "OBJECT",
  required: ["text"],
  properties: {
    text: { type: "STRING" },
  },
} as const;

export function textFromRephrase(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const text = (data as { text?: unknown }).text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

export function parseApprovalText(value: unknown): { ok: true; text: string } | { ok: false; message: string } {
  if (typeof value !== "string") return { ok: false, message: "The draft text is missing." };
  const text = value.trim();
  if (!text) return { ok: false, message: "Write or keep a draft before publishing." };
  if (text.length > 25_000) return { ok: false, message: "That draft is too long to publish." };
  return { ok: true, text };
}
