import { readFileSync } from "node:fs";
import { defaultOutputBudgets } from "../lib/ai/budgets";
import { planExtractionProviders, type AiEnv, type ProviderId } from "../lib/ai/catalog";
import { buildDiagnostic } from "../lib/ai/diagnostics";
import { extractionSystem, extractionUser, parseExtraction, promptVersion } from "../lib/ai/extract";
import { extractWithProviders } from "../lib/ai/extraction";
import { chatDraftBody, chatExtractionBody, chatHealthBody, geminiBody, groqExtractionReasoning } from "../lib/ai/payload";
import type { ProviderCallResult, ProviderPlan } from "../lib/ai/route";
import { judgeGenerated, parseStructuredObject, readChatGenerated } from "../lib/ai/structured";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const posts = Array.from({ length: 10 }, (_, index) => ({
  id: `post-${index + 1}`,
  text: `Nigeria's electoral commission published register figure ${100 + index}.`,
  username: "desk",
  relevance: "political" as const,
}));
const user = extractionUser(posts);
const packed = JSON.parse(user) as { posts: Array<{ id: string; text: string; username?: string }> };
check("the fixture has the 10-post scan shape", packed.posts.length === 10 && packed.posts.every((post) => post.id.startsWith("post-") && post.text.length > 0 && post.username === undefined));
check("the prompt asks for JSON only", extractionSystem.includes("Return JSON only.") && extractionSystem.includes("Do not use markdown.") && extractionSystem.includes("Do not include commentary outside the object."));
check("the prompt version moved past the Gemini-schema request", promptVersion === "claim-extract-v3");

const groq = chatExtractionBody({
  model: "openai/gpt-oss-20b",
  system: extractionSystem,
  user,
  temperature: 0,
  maxTokens: defaultOutputBudgets.extraction,
  reasoningEffort: groqExtractionReasoning("openai/gpt-oss-20b"),
});
check("Groq extraction does not send provider JSON mode", !("response_format" in groq) && groq.temperature === 0 && groq.max_tokens === 4096);
check("Groq extraction uses the documented low reasoning effort", groq.reasoning_effort === "low");
check("a non-gpt-oss Groq model does not get an invented reasoning parameter", groqExtractionReasoning("llama-3.3-70b") === undefined);

const router = chatExtractionBody({
  model: "openrouter/free",
  system: extractionSystem,
  user,
  temperature: 0,
  maxTokens: defaultOutputBudgets.extraction,
});
check("OpenRouter extraction stays on the free router without native schema", router.model === "openrouter/free" && !("response_format" in router) && !("reasoning_effort" in router));

const health = chatHealthBody("openai/gpt-oss-20b", "Reply with JSON.", 1024);
const draft = chatDraftBody({ model: "openai/gpt-oss-20b", system: "Desk", user: "Write.", schema: { type: "object" }, temperature: 0.8, maxTokens: 4096 });
check("health and drafting request shapes are unchanged", !("response_format" in health) && draft.response_format.type === "json_object");
const gemini = geminiBody({ system: extractionSystem, user, schema: { type: "OBJECT", required: ["claims"] }, temperature: 0, maxTokens: 4096 });
check("Gemini still receives its own response schema once", gemini.generationConfig.responseMimeType === "application/json" && gemini.generationConfig.responseSchema != null);

function envelope(content: string, finish = "stop") {
  return { choices: [{ finish_reason: finish, message: { role: "assistant", content } }] };
}
const many = {
  claims: [
    { postId: "post-1", claim: "The commission published figure 100.", why: "The number is in the post.", needed: "The official register page.", confidence: "moderate" },
    { postId: "post-2", claim: "The commission published figure 101.", why: "The number is in the post.", needed: "The official register page.", confidence: "low" },
  ],
};
const readMany = readChatGenerated(envelope(JSON.stringify(many)));
check("a plain JSON answer parses to multiple claims", judgeGenerated("extraction", readMany) === "ok" && parseExtraction(readMany.data)?.claims.length === 2);
check("an empty claim list is valid", parseExtraction({ claims: [] })?.claims.length === 0);
check("malformed JSON is not a valid extraction", parseStructuredObject('{"claims":') === null && parseExtraction({ notes: [] }) === null);
const fenced = readChatGenerated(envelope("```json\n" + JSON.stringify({ claims: [] }) + "\n```"));
check("fenced JSON is parsed", parseExtraction(fenced.data)?.claims.length === 0);
const cut = readChatGenerated(envelope('{"claims":[{"postId":"post-1"', "length"));
check("truncated JSON is an output cutoff", judgeGenerated("extraction", cut) === "output_limit" && cut.data === null);
const reasoned = readChatGenerated(envelope('The figure is already in the post.\n' + JSON.stringify(many)));
check("reasoning before JSON still yields the object", parseExtraction(reasoned.data)?.claims.length === 2);
check("a non-empty array of invalid claims is rejected", parseExtraction({ claims: [{ postId: "post-1" }] }) === null);

function env(): AiEnv {
  return {
    groqKey: true,
    openrouterKey: true,
    geminiKey: true,
    groqModel: null,
    openrouterModel: null,
    geminiModel: null,
    groqModelInvalid: false,
    openrouterModelInvalid: false,
    geminiModelInvalid: false,
    paidUsage: false,
    daily: { groq: 40, openrouter: 50, gemini: 8 },
  };
}
const used: Record<ProviderId, number> = { groq: 0, openrouter: 0, gemini: 0 };
function result(partial: Partial<ProviderCallResult> & Pick<ProviderCallResult, "ok">): ProviderCallResult {
  return { data: undefined, failureReason: partial.ok ? null : "failed", diagnostic: null, inputTokens: null, reasoningTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: 0, ...partial };
}
async function main() {
const called: string[] = [];
const routed = await extractWithProviders({
  requestId: "66666666-6666-4666-8666-666666666666",
  posts,
  plans: planExtractionProviders(env(), used),
  timeoutMs: 25_000,
  call: async (plan: ProviderPlan) => {
    called.push(plan.id);
    if (plan.id === "groq") {
      return result({
        ok: false,
        diagnostic: buildDiagnostic({
          httpStatus: 400,
          body: { error: { message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.", type: "invalid_request_error", code: "json_validate_failed" } },
          endpoint: "completed response",
          model: plan.model,
        }),
        failureReason: "json_validate_failed",
      });
    }
    if (plan.id === "openrouter") {
      return result({
        ok: false,
        diagnostic: buildDiagnostic({ httpStatus: 200, endpoint: "completed response", model: plan.model, outputLimited: true, message: "The output budget was used up." }),
        failureReason: "output",
      });
    }
    return result({ ok: true, data: { claims: [] } });
  },
});
check("schema rejection and output cutoff fall through, and an empty claim list stops", called.join(",") === "groq,openrouter,gemini" && routed.ok && routed.provider === "gemini" && routed.parsed?.claims.length === 0);
check("json_validate_failed is a provider rejection", routed.attempts[0]?.diagnostic?.classification === "PROVIDER_REQUEST_REJECTED");
check("the output cutoff stays distinct", routed.attempts[1]?.diagnostic?.classification === "OUTPUT_TOKEN_LIMIT");

const transport = readFileSync(new URL("../lib/ai/transport.ts", import.meta.url), "utf8");
check("Gemini is still one request and is not retried", transport.includes("geminiBody") && !transport.includes("retry"));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("extraction request checks passed");
}

main();
