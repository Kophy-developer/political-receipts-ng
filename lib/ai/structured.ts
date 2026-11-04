import { sanitizeProviderMessage, type ResponseShape } from "@/lib/ai/diagnostics";

/**
 * Reads generated text out of a provider envelope, then parses that text.
 * The HTTP body is not the application object. JSON.parse only; no eval.
 */

export type GeneratedRead = ResponseShape & {
  data: Record<string, unknown> | null;
};

function envelopeLabel(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body == null ? "empty" : Array.isArray(body) ? "array" : typeof body;
  return `object:${Object.keys(body).slice(0, 12).join(",")}`;
}

function preview(text: string) {
  const clean = sanitizeProviderMessage(text);
  return clean ? clean.slice(0, 300) : null;
}

function contentTypeOf(content: unknown) {
  if (content === undefined) return "missing";
  if (content === null) return "null";
  if (Array.isArray(content)) return "array";
  return typeof content;
}

function tryObject(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function fencedBlocks(text: string) {
  const blocks: string[] = [];
  const closed = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(closed)) {
    if (match[1]?.trim()) blocks.push(match[1].trim());
  }
  if (blocks.length === 0) {
    const open = text.match(/```(?:json)?\s*([\s\S]+)$/i);
    if (open?.[1]?.trim()) blocks.push(open[1].trim());
  }
  return blocks;
}

function balancedObjects(text: string) {
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        found.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return found;
}

export function parseStructuredObject(input: string) {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return null;
  const direct = tryObject(text);
  if (direct) return direct;
  for (const block of fencedBlocks(text)) {
    const parsed = tryObject(block);
    if (parsed) return parsed;
  }
  const objects = balancedObjects(text);
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const parsed = tryObject(objects[index]!);
    if (parsed) return parsed;
  }
  return null;
}

function partText(part: unknown) {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const record = part as Record<string, unknown>;
  if (record.thought === true || record.type === "reasoning") return "";
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  return "";
}

function assistantText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(partText).filter(Boolean).join("\n");
  if (content && typeof content === "object") return JSON.stringify(content);
  return "";
}

export function readChatGenerated(body: unknown): GeneratedRead {
  const choices = body && typeof body === "object" && Array.isArray((body as { choices?: unknown }).choices)
    ? (body as { choices: unknown[] }).choices
    : [];
  const first = choices[0];
  const message = first && typeof first === "object" ? (first as { message?: unknown }).message : null;
  const content = message && typeof message === "object" ? (message as { content?: unknown }).content : undefined;
  const finish = first && typeof first === "object" && typeof (first as { finish_reason?: unknown }).finish_reason === "string"
    ? (first as { finish_reason: string }).finish_reason.slice(0, 40)
    : null;
  const text = assistantText(content);
  return {
    envelope: envelopeLabel(body),
    choiceCount: choices.length,
    finishReason: finish,
    contentType: contentTypeOf(content),
    contentLength: text.length,
    contentPreview: preview(text),
    data: parseStructuredObject(text),
  };
}

export function readGeminiGenerated(body: unknown): GeneratedRead {
  const candidates = body && typeof body === "object" && Array.isArray((body as { candidates?: unknown }).candidates)
    ? (body as { candidates: unknown[] }).candidates
    : [];
  const first = candidates[0];
  const content = first && typeof first === "object" ? (first as { content?: unknown }).content : null;
  const parts = content && typeof content === "object" && Array.isArray((content as { parts?: unknown }).parts)
    ? (content as { parts: unknown[] }).parts
    : [];
  const finish = first && typeof first === "object" && typeof (first as { finishReason?: unknown }).finishReason === "string"
    ? (first as { finishReason: string }).finishReason.slice(0, 40)
    : null;
  const text = parts.map(partText).filter(Boolean).join("\n");
  return {
    envelope: envelopeLabel(body),
    choiceCount: candidates.length,
    finishReason: finish,
    contentType: parts.length ? "parts" : contentTypeOf(content),
    contentLength: text.length,
    contentPreview: preview(text),
    data: parseStructuredObject(text),
  };
}

export function healthObjectOk(data: Record<string, unknown> | null) {
  return data?.ok === true;
}

/** Groq uses "length". Gemini uses "MAX_TOKENS". Both mean the output budget stopped the model. */
export function generationCutOff(finishReason: string | null) {
  const finish = (finishReason ?? "").toLowerCase();
  return finish === "length" || finish === "max_tokens";
}

export function judgeGenerated(mode: "health" | "generate", generated: GeneratedRead) {
  if (generationCutOff(generated.finishReason)) return "output_limit" as const;
  if (!generated.data) return "invalid" as const;
  if (mode === "health" && !healthObjectOk(generated.data)) return "not_ok" as const;
  return "ok" as const;
}

export function responseShape(read: GeneratedRead): ResponseShape {
  return {
    envelope: read.envelope,
    choiceCount: read.choiceCount,
    finishReason: read.finishReason,
    contentType: read.contentType,
    contentLength: read.contentLength,
    contentPreview: read.contentPreview,
  };
}
