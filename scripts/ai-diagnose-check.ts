import { defaultOutputBudgets } from "../lib/ai/budgets";
import { chatDraftBody, chatHealthBody, geminiBody, groqChatEndpoint } from "../lib/ai/payload";
import {
  buildDiagnostic,
  editorMessage,
  retainedFailure,
  sanitizeProviderMessage,
  providerReadout,
  shownProviderStatus,
  statusForClassification,
} from "../lib/ai/diagnostics";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const endpoint = groqChatEndpoint;
const model = "openai/gpt-oss-20b";

function http(status: number, body: unknown, headers: Record<string, string> = {}) {
  return buildDiagnostic({ httpStatus: status, body, headers, endpoint, model });
}

const auth = http(401, {
  error: { message: "Invalid API key sk-live-secretvalue1234567890", type: "invalid_request_error", code: "invalid_api_key" },
}, { "x-request-id": "req_auth_1" });
check("401 is an authentication failure", auth.classification === "AUTHENTICATION_FAILED" && statusForClassification(auth.classification) === "AUTH ERROR");
check("401 keeps the provider code and redacts the key", auth.providerCode === "invalid_api_key" && !editorMessage(auth).includes("sk-live") && editorMessage(auth).includes("invalid_api_key"));
check("401 keeps the request id and endpoint", editorMessage(auth).includes("req_auth_1") && editorMessage(auth).includes(endpoint) && editorMessage(auth).includes(model));

const unsupported = http(400, { error: { message: "response_format is not supported for this model", type: "invalid_request_error", code: "unsupported_parameter" } });
check("400 unsupported parameter is a bad request", unsupported.classification === "BAD_REQUEST" && statusForClassification(unsupported.classification) === "UNVERIFIED");
check("400 message is shown", editorMessage(unsupported).includes("response_format is not supported"));

const missing = http(404, { error: { message: "The model does not exist", type: "invalid_request_error", code: "model_not_found" } });
check("404 is model not found", missing.classification === "MODEL_NOT_FOUND" && statusForClassification(missing.classification) === "UNAVAILABLE");

const limited = http(429, { error: { message: "Rate limit reached", type: "tokens", code: "rate_limit_exceeded" } }, {
  "retry-after": "2",
  "x-ratelimit-remaining-requests": "0",
});
check("429 is rate limited", limited.classification === "RATE_LIMITED" && statusForClassification(limited.classification) === "RATE LIMITED");
check("429 keeps rate-limit headers", editorMessage(limited).includes("retry-after=2") && editorMessage(limited).includes("x-ratelimit-remaining-requests=0"));

const daily = http(429, { error: { message: "Daily token limit reached", code: "rate_limit_exceeded" } });
check("429 daily quota is a daily limit", daily.classification === "DAILY_LIMIT_REACHED");

const server = http(500, { error: { message: "internal error", type: "server_error" } });
check("500 is a provider server error", server.classification === "PROVIDER_SERVER_ERROR" && statusForClassification(server.classification) === "UNAVAILABLE");

const timedOut = buildDiagnostic({ httpStatus: null, endpoint, model, network: "timeout", message: "The request timed out." });
check("timeout stays unverified", timedOut.classification === "TIMEOUT" && statusForClassification(timedOut.classification) === "UNVERIFIED");

const malformed = buildDiagnostic({ httpStatus: 200, endpoint, model, invalidResponse: true, message: "The response was not a JSON object." });
check("malformed JSON is an invalid response", malformed.classification === "INVALID_RESPONSE" && editorMessage(malformed).includes("not a JSON object"));

const exhausted = buildDiagnostic({
  httpStatus: 200,
  endpoint,
  model,
  outputLimited: true,
  message: "The output budget was used up before the assistant returned any content.",
});
check("an empty length stop is an output token limit and stays unverified", exhausted.classification === "OUTPUT_TOKEN_LIMIT" && statusForClassification(exhausted.classification) === "UNVERIFIED");

const health = chatHealthBody(model, 'Reply with {"ok":true}.', defaultOutputBudgets.health);
check("health body is only the chat completion fields Groq documents for this check", JSON.stringify(Object.keys(health)) === JSON.stringify(["model", "temperature", "max_tokens", "messages"]));
check("health body does not send response_format or a draft schema", !("response_format" in health) && health.messages.length === 1 && health.messages[0]?.content.includes('{"ok":true}'));
check("health output budget is no longer 32", health.max_tokens === 1024 && health.max_tokens > 32);
check("health uses the chat completions endpoint", groqChatEndpoint === "https://api.groq.com/openai/v1/chat/completions");

const draft = chatDraftBody({ model, system: "Desk rules", user: "Write the drafts", schema: { type: "object" }, temperature: 0.8, maxTokens: 2048 });
check("draft requests keep json_object separate from the health body", draft.response_format.type === "json_object" && !("response_format" in health));

const gemini = geminiBody({ system: "check", user: 'Reply with {"ok":true}.', schema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } } }, temperature: 0, maxTokens: 32 });
check("gemini health uses its own schema field", "responseSchema" in gemini.generationConfig && !("response_format" in gemini));

const legacy = retainedFailure("unavailable", null);
check("a collapsed unavailable row does not invent the provider error", legacy?.retained === false && legacy.text === "Original provider error was not retained." && legacy.status === "UNVERIFIED");

check("a credential with no live request is not called available", shownProviderStatus({
  credential: true,
  callable: true,
  skipReason: null,
  used: 0,
  limit: 40,
  latest: null,
}) === "CREDENTIAL CONFIGURED");

check("the stored groq failure is unverified", shownProviderStatus({
  credential: true,
  callable: true,
  skipReason: null,
  used: 2,
  limit: 40,
  latest: { status: "failure", reason: "unavailable", diagnostic: null },
}) === "UNVERIFIED");

const succeeded = providerReadout({
  latest: { status: "success", task: "health", completedAt: "2026-11-04T20:05:00.000Z", reason: "INVALID_RESPONSE. HTTP 200." },
  earlierFailure: "INVALID_RESPONSE. HTTP 200. The assistant content was not a JSON object.",
});
check("a successful health check is the latest result", succeeded.latestKind === "success" && succeeded.latestResult?.includes("Latest health check succeeded") && succeeded.latestResult.includes("CT") && !succeeded.latestResult.includes("INVALID_RESPONSE"));
check("an older failure stays history", succeeded.earlierFailure?.includes("INVALID_RESPONSE") === true);
check("a failed latest result is not dressed up as success", providerReadout({
  latest: { status: "failure", task: "health", completedAt: "2026-11-04T19:36:00.000Z", reason: "INVALID_RESPONSE. HTTP 200." },
  earlierFailure: "older",
}).latestKind === "failure" && providerReadout({
  latest: { status: "failure", task: "health", completedAt: "2026-11-04T19:36:00.000Z", reason: "INVALID_RESPONSE. HTTP 200." },
  earlierFailure: "older",
}).earlierFailure === null);

check("a successful tiny response can be available", shownProviderStatus({
  credential: true,
  callable: true,
  skipReason: null,
  used: 1,
  limit: 40,
  latest: { status: "success", reason: null, diagnostic: null },
}) === "AVAILABLE");

check("gemini's spent desk allowance still has its own status", shownProviderStatus({
  credential: true,
  callable: false,
  skipReason: "daily allowance exhausted",
  used: 8,
  limit: 8,
  latest: null,
}) === "DAILY APP LIMIT REACHED");

check("a secret in a message is redacted", !sanitizeProviderMessage("rejected bearer gsk_abcdefghijklmnopqrstuvwxyz").includes("gsk_"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ai diagnose checks passed");
