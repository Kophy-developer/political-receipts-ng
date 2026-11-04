import { defaultOutputBudgets, tokenBudget } from "../lib/ai/budgets";
import { buildDiagnostic, editorMessage, shownProviderStatus, statusForClassification } from "../lib/ai/diagnostics";
import { chatDraftBody, chatHealthBody } from "../lib/ai/payload";
import { judgeGenerated, readChatGenerated, responseShape } from "../lib/ai/structured";
import { readChatUsage } from "../lib/ai/usage";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function envelope(content: string, finish: string, extra: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl-budget",
    object: "chat.completion",
    model: "openai/gpt-oss-20b",
    choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content, reasoning: "This reasoning text is not the assistant answer." } }],
    ...extra,
  };
}

const emptyCut = readChatGenerated(envelope("", "length"));
check("length with empty content is an output cutoff", emptyCut.contentLength === 0 && emptyCut.finishReason === "length" && judgeGenerated("health", emptyCut) === "output_limit");

const truncated = readChatGenerated(envelope('{"ok":tru', "length"));
check("length with truncated JSON is not accepted", truncated.data === null && judgeGenerated("health", truncated) === "output_limit");

const partialObject = readChatGenerated(envelope('{"ok":true}', "length"));
check("length with JSON that parses is still not accepted", partialObject.data?.ok === true && judgeGenerated("health", partialObject) === "output_limit");

const stopped = readChatGenerated(envelope('{"ok":true}', "stop"));
check("stop with valid JSON is a health success", judgeGenerated("health", stopped) === "ok" && stopped.contentLength > 0);

const reasoned = envelope('{"ok":true}', "stop", {
  usage: {
    prompt_tokens: 18,
    completion_tokens: 40,
    total_tokens: 58,
    completion_tokens_details: { reasoning_tokens: 31 },
  },
  usage_breakdown: { models: [{ model: "openai/gpt-oss-20b", usage: { completion_tokens_details: { reasoning_tokens: 31 } } }] },
  x_groq: { id: "req_budget_fixture" },
});
const reasonedRead = readChatGenerated(reasoned);
const reasonedUsage = readChatUsage(reasoned);
check("reasoning tokens are recorded separately from visible JSON", reasonedUsage.inputTokens === 18 && reasonedUsage.reasoningTokens === 31 && reasonedUsage.outputTokens === 40 && reasonedUsage.totalTokens === 58);
check("visible content is the JSON, not the reasoning field", reasonedRead.data?.ok === true && reasonedRead.contentPreview === '{"ok":true}' && judgeGenerated("health", reasonedRead) === "ok");

const breakdownOnly = readChatUsage({
  usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
  usage_breakdown: { models: [{ model: "openai/gpt-oss-20b", usage: { completion_tokens_details: { reasoning_tokens: 9 } } }] },
  choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
});
check("usage_breakdown supplies reasoning tokens when the top-level field is absent", breakdownOnly.reasoningTokens === 9 && breakdownOnly.inputTokens === 10);

const classified = buildDiagnostic({
  httpStatus: 200,
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  model: "openai/gpt-oss-20b",
  outputLimited: true,
  shape: responseShape(emptyCut),
  tokens: { input: 18, reasoning: 32, output: 32, total: 50 },
  message: "The output budget was used up before the assistant returned any content.",
});
const classifiedText = editorMessage(classified);
check("OUTPUT_TOKEN_LIMIT is the classification", classified.classification === "OUTPUT_TOKEN_LIMIT" && statusForClassification(classified.classification) === "UNVERIFIED");
check("the editor message names the empty finish and the token split", classifiedText.includes("before the assistant returned any content") && classifiedText.includes("Finish length") && classifiedText.includes("Prompt 18") && classifiedText.includes("Reasoning 32") && classifiedText.includes("Completion 32") && classifiedText.includes("Total 50"));
check("a length failure does not become available", shownProviderStatus({
  credential: true,
  callable: true,
  skipReason: null,
  used: 4,
  limit: 40,
  latest: { status: "failure", reason: "OUTPUT_TOKEN_LIMIT", diagnostic: classified },
}) === "UNVERIFIED");

const health = chatHealthBody("openai/gpt-oss-20b", 'Reply with {"ok":true}.', defaultOutputBudgets.health);
const draft = chatDraftBody({
  model: "openai/gpt-oss-20b",
  system: "Desk rules",
  user: "Write four drafts.",
  schema: { type: "object" },
  temperature: 0.8,
  maxTokens: defaultOutputBudgets.draft,
});
check("the health budget is 1024 and the draft budget is 4096", health.max_tokens === 1024 && draft.max_tokens === 4096 && draft.max_tokens > health.max_tokens);
check("a tiny configured budget falls back to the task default", tokenBudget("32", defaultOutputBudgets.health) === 1024 && tokenBudget("9000", defaultOutputBudgets.draft) === 4096);
check("a budget inside the range is kept", tokenBudget("1536", defaultOutputBudgets.health) === 1536);
check("extraction stays between the health and draft budgets", defaultOutputBudgets.extraction === 2048 && defaultOutputBudgets.extraction > defaultOutputBudgets.health && defaultOutputBudgets.extraction < defaultOutputBudgets.draft);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ai budget checks passed");
