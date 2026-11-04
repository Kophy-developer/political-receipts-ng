/**
 * Provider request bodies. Health checks stay tiny.
 * Groq and OpenRouter use chat completions, not the Responses API.
 * Draft bodies may include json_object. Health bodies do not.
 */

export const groqChatEndpoint = "https://api.groq.com/openai/v1/chat/completions";
export const openRouterChatEndpoint = "https://openrouter.ai/api/v1/chat/completions";

export function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

/** Fields Groq's chat completions accept for a connectivity check: model, messages, temperature, max_tokens. */
export function chatHealthBody(model: string, userPrompt: string) {
  return {
    model,
    temperature: 0,
    max_tokens: 32,
    messages: [{ role: "user" as const, content: userPrompt }],
  };
}

export function chatDraftBody(input: { model: string; system: string; user: string; schema: unknown; temperature: number; maxTokens: number }) {
  return {
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    messages: [
      { role: "system" as const, content: `${input.system}\n\nReturn one JSON object and nothing else. Match this schema: ${JSON.stringify(input.schema)}` },
      { role: "user" as const, content: input.user },
    ],
    response_format: { type: "json_object" as const },
  };
}

export function geminiBody(input: { system: string; user: string; schema: unknown; temperature: number; maxTokens: number }) {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user" as const, parts: [{ text: input.user }] }],
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
      responseMimeType: "application/json",
      responseSchema: input.schema,
    },
  };
}
