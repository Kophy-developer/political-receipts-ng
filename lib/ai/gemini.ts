import "server-only";
import { readOutputBudgets } from "@/lib/ai/budgets";
import type { AiJsonResult } from "@/lib/ai/types";
import { geminiModelName } from "@/lib/ai/env";

export type GeminiProvider = {
  name: "gemini";
  model: string;
  completeJson(input: { promptVersion: string; system: string; user: string }): Promise<AiJsonResult>;
};

const emptyUsage = { inputTokens: null, outputTokens: null };

function scrub(message: string) {
  if (/key|token|bearer|authorization|api[_ -]?key/i.test(message)) return "The model request was rejected.";
  return message.replace(/\s+/g, " ").trim().slice(0, 180) || "The model request failed.";
}

function usageFrom(value: unknown) {
  if (!value || typeof value !== "object") return emptyUsage;
  const usage = value as { promptTokenCount?: unknown; candidatesTokenCount?: unknown };
  const input = typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : null;
  const output = typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null;
  return { inputTokens: input, outputTokens: output };
}

export async function geminiHealth() {
  const model = geminiModelName();
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false as const, model, message: "Gemini is not configured.", called: false, usage: emptyUsage };
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Reply with JSON {"ok":true}. This is a connectivity check. Do not mention news, people, or places.' }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: readOutputBudgets().health,
          responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", required: ["ok"], properties: { ok: { type: "BOOLEAN" } } },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false as const, model, message: "The model did not answer in time.", called: true, usage: emptyUsage };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false as const, model, message: "The model returned an unreadable response.", called: true, usage: emptyUsage };
  }
  const usage = usageFrom((body as { usageMetadata?: unknown })?.usageMetadata);
  if (!response.ok) {
    const error = (body as { error?: { message?: string } })?.error?.message;
    return { ok: false as const, model, message: scrub(error || `The model returned ${response.status}.`), called: true, usage };
  }
  return { ok: true as const, model, message: "Available", called: true, usage };
}

export async function geminiJson(input: {
  promptVersion: string;
  system: string;
  user: string;
  schema: unknown;
  maxOutputTokens?: number;
}) {
  const model = geminiModelName();
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return { ok: false as const, called: false, provider: "gemini", model, promptVersion: input.promptVersion, message: "Gemini is not configured.", usage: emptyUsage };
  }
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: input.maxOutputTokens ?? readOutputBudgets().extraction,
          responseMimeType: "application/json",
          responseSchema: input.schema,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false as const, called: true, provider: "gemini", model, promptVersion: input.promptVersion, message: "The model did not answer in time.", usage: emptyUsage };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false as const, called: true, provider: "gemini", model, promptVersion: input.promptVersion, message: "The model returned an unreadable response.", usage: emptyUsage };
  }
  const usage = usageFrom((body as { usageMetadata?: unknown })?.usageMetadata);
  if (!response.ok) {
    const error = (body as { error?: { message?: string } })?.error?.message;
    return { ok: false as const, called: true, provider: "gemini", model, promptVersion: input.promptVersion, message: scrub(error || `The model returned ${response.status}.`), usage };
  }
  const text = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? "";
  try {
    return { ok: true as const, called: true, provider: "gemini", model, promptVersion: input.promptVersion, data: JSON.parse(text), usage };
  } catch {
    return { ok: false as const, called: true, provider: "gemini", model, promptVersion: input.promptVersion, message: "The model response was not valid JSON.", usage };
  }
}

export function geminiProvider(): GeminiProvider {
  const model = geminiModelName();
  return {
    name: "gemini",
    model,
    async completeJson(input) {
      const key = process.env.GEMINI_API_KEY?.trim();
      if (!key) {
        return { ok: false, provider: "gemini", model, promptVersion: input.promptVersion, message: "Gemini is not configured.", usage: emptyUsage };
      }
      let response: Response;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [{ role: "user", parts: [{ text: input.user }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: readOutputBudgets().extraction,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                required: ["posts", "claims"],
                properties: {
                  posts: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      required: ["postId", "relevance"],
                      properties: {
                        postId: { type: "STRING" },
                        relevance: { type: "STRING", enum: ["political", "possibly_political", "not_political"] },
                      },
                    },
                  },
                  claims: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      required: ["postId", "claim", "whyVerifiable", "evidenceNeeded", "confidence"],
                      properties: {
                        postId: { type: "STRING" },
                        claim: { type: "STRING" },
                        speaker: { type: "STRING" },
                        topic: { type: "STRING" },
                        entities: { type: "ARRAY", items: { type: "STRING" } },
                        whyVerifiable: { type: "STRING" },
                        evidenceNeeded: { type: "STRING" },
                        confidence: { type: "STRING", enum: ["low", "moderate", "high"] },
                      },
                    },
                  },
                },
              },
            },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        return { ok: false, provider: "gemini", model, promptVersion: input.promptVersion, message: "The model did not answer in time.", usage: emptyUsage };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, provider: "gemini", model, promptVersion: input.promptVersion, message: "The model returned an unreadable response.", usage: emptyUsage };
      }
      const usage = usageFrom((body as { usageMetadata?: unknown })?.usageMetadata);
      if (!response.ok) {
        const error = (body as { error?: { message?: string } })?.error?.message;
        return { ok: false, provider: "gemini", model, promptVersion: input.promptVersion, message: scrub(error || `The model returned ${response.status}.`), usage };
      }
      const text = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? "";
      try {
        return { ok: true, provider: "gemini", model, promptVersion: input.promptVersion, data: JSON.parse(text), usage };
      } catch {
        return { ok: false, provider: "gemini", model, promptVersion: input.promptVersion, message: "The model response was not valid JSON.", usage };
      }
    },
  };
}
