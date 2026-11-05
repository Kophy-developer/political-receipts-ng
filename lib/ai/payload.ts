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
export function chatHealthBody(model: string, userPrompt: string, maxTokens: number) {
  return {
    model,
    temperature: 0,
    max_tokens: maxTokens,
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

/**
 * Extraction does not use Groq JSON Object Mode or JSON Schema Mode.
 * Those modes return HTTP 400 json_validate_failed and discard the text
 * when openai/gpt-oss-20b does not emit pure JSON. The app parses the
 * ordinary assistant content instead.
 * reasoning_effort "low" is the lowest value Groq documents for
 * openai/gpt-oss-20b and openai/gpt-oss-120b. Other models omit it.
 */
export function groqExtractionReasoning(model: string) {
  if (model === "openai/gpt-oss-20b" || model === "openai/gpt-oss-120b") return "low" as const;
  return undefined;
}

export function chatExtractionBody(input: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  return {
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.user },
    ],
  };
}

/** Editorial assessment parses the assistant text locally. No provider JSON schema is attached. */
export function geminiEditorialBody(input: { system: string; user: string; temperature: number; maxTokens: number }) {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user" as const, parts: [{ text: input.user }] }],
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
    },
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
