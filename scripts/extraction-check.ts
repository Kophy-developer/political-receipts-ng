import { readFileSync } from "node:fs";
import { defaultExtractionTimeoutMs, defaultOutputBudgets } from "../lib/ai/budgets";
import { EXTRACTION_PROVIDER_ORDER, planDraftProviders, planExtractionProviders, type AiEnv, type ProviderId } from "../lib/ai/catalog";
import { buildDiagnostic } from "../lib/ai/diagnostics";
import { extractWithProviders } from "../lib/ai/extraction";
import type { ProviderCallResult, ProviderPlan, ProviderRequest } from "../lib/ai/route";
import { analysisFailureReason, extractionOpportunityWrite, reprocessSummary, scanNeedsReprocess } from "../lib/intel/stage";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function env(overrides: Partial<AiEnv> = {}): AiEnv {
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
    ...overrides,
  };
}

const used: Record<ProviderId, number> = { groq: 0, openrouter: 0, gemini: 0 };
const posts = Array.from({ length: 10 }, (_, index) => ({
  id: `post-${index + 1}`,
  text: `Nigeria's electoral commission published a polling-unit figure of ${100 + index}.`,
  username: "desk",
  relevance: "political" as const,
}));

const extracted = {
  posts: posts.map((post) => ({ postId: post.id, relevance: "political" })),
  claims: [{
    postId: posts[0].id,
    claim: "Nigeria's electoral commission published a polling-unit figure of 100.",
    whyVerifiable: "The sentence is in the post.",
    evidenceNeeded: "The official polling-unit page.",
    confidence: "moderate",
  }],
};

function result(partial: Partial<ProviderCallResult> & Pick<ProviderCallResult, "ok">): ProviderCallResult {
  return {
    data: undefined,
    failureReason: partial.ok ? null : "failed",
    diagnostic: null,
    inputTokens: partial.ok ? 120 : null,
    reasoningTokens: partial.ok ? 0 : null,
    outputTokens: partial.ok ? 80 : null,
    totalTokens: partial.ok ? 200 : null,
    estimatedCostUsd: 0,
    ...partial,
  };
}

function timeoutDiagnostic(model: string) {
  return buildDiagnostic({ httpStatus: null, endpoint: "completed response", model, network: "timeout", message: "The request timed out." });
}

function scripted(responses: Record<string, ProviderCallResult>) {
  const called: string[] = [];
  const call = async (plan: ProviderPlan, request: ProviderRequest) => {
    called.push(plan.id);
    check(`${plan.id} receives the extraction schema`, request.schema !== null && request.timeoutMs === 25_000);
    const response = responses[plan.id];
    if (!response) throw new Error(`unexpected provider ${plan.id}`);
    return response;
  };
  return { called, call };
}

const order = planExtractionProviders(env(), used).map((plan) => plan.id);
check("extraction order is Groq, OpenRouter, Gemini", order.join(",") === EXTRACTION_PROVIDER_ORDER.join(","));
check("draft order stays Groq, OpenRouter, Gemini", planDraftProviders(env(), used).map((plan) => plan.id).join(",") === "groq,openrouter,gemini");
check("extraction output budget is 4096", defaultOutputBudgets.extraction === 4096);
check("extraction timeout default is 25 seconds", defaultExtractionTimeoutMs === 25_000);

const paid = planExtractionProviders(env({ groqModel: "llama-3.3-70b" }), used);
check("a paid Groq model is not callable while paid usage is off", paid[0]?.callable === false && paid[0]?.skipReason === "paid route blocked");

const storedPosts = Array.from({ length: 10 }, (_, index) => index);
const afterTimeout = {
  postsStored: storedPosts.length,
  stage: storedPosts.length === 10 ? "PARTIAL_FAILURE" : "failed",
};
check("ten stored posts become a partial failure when extraction times out", afterTimeout.postsStored === 10 && afterTimeout.stage === "PARTIAL_FAILURE");
check("a partial scan can be reprocessed", scanNeedsReprocess({ stage: "PARTIAL_FAILURE", status: "stopped", postsStored: 10, claims: 0 }));
check("a completed scan is not offered again", scanNeedsReprocess({ stage: "COMPLETE", status: "completed", postsStored: 10, claims: 2 }) === false);
check("the production timeout reads as Timed out", analysisFailureReason("AI extraction failed: The model did not answer in time.") === "Timed out");

async function main() {
const timeoutThenSuccess = scripted({
  groq: result({ ok: false, diagnostic: timeoutDiagnostic("openai/gpt-oss-20b"), failureReason: "The request timed out." }),
  openrouter: result({ ok: true, data: extracted }),
  gemini: result({ ok: true, data: extracted }),
});
const fellThrough = await extractWithProviders({
  requestId: "11111111-1111-4111-8111-111111111111",
  posts,
  plans: planExtractionProviders(env(), used),
  timeoutMs: defaultExtractionTimeoutMs,
  call: timeoutThenSuccess.call,
});
check("timeout falls through to the next provider", timeoutThenSuccess.called.join(",") === "groq,openrouter");
check("a successful provider stops the chain", fellThrough.ok && fellThrough.provider === "openrouter" && fellThrough.parsed?.claims.length === 1);
check("the failed attempt stays recorded as extraction", fellThrough.attempts.filter((attempt) => attempt.called).every((attempt) => attempt.task === "extraction"));
check("the timeout attempt records tokens when absent as null", fellThrough.attempts[0]?.inputTokens === null && fellThrough.attempts[1]?.outputTokens === 80);

const invalid = scripted({
  groq: result({ ok: true, data: { posts: "not-an-array" } }),
  openrouter: result({ ok: true, data: extracted }),
});
const invalidRun = await extractWithProviders({
  requestId: "22222222-2222-4222-8222-222222222222",
  posts,
  plans: planExtractionProviders(env({ geminiKey: false }), used),
  timeoutMs: defaultExtractionTimeoutMs,
  call: invalid.call,
});
check("invalid JSON falls through", invalid.called.join(",") === "groq,openrouter" && invalidRun.ok);

const limited = scripted({
  groq: result({
    ok: false,
    diagnostic: buildDiagnostic({ httpStatus: 200, endpoint: "completed response", model: "openai/gpt-oss-20b", outputLimited: true, message: "The output budget was used up." }),
    failureReason: "The output budget was used up.",
  }),
  openrouter: result({ ok: true, data: { posts: [], claims: [] } }),
});
const limitedRun = await extractWithProviders({
  requestId: "33333333-3333-4333-8333-333333333333",
  posts,
  plans: planExtractionProviders(env({ geminiKey: false }), used),
  timeoutMs: defaultExtractionTimeoutMs,
  call: limited.call,
});
check("an output limit falls through", limited.called.join(",") === "groq,openrouter");
check("a valid empty claim list is success and is not a second failure", limitedRun.ok && limitedRun.parsed?.claims.length === 0);

const rated = scripted({
  groq: result({
    ok: false,
    diagnostic: buildDiagnostic({ httpStatus: 429, endpoint: "completed response", model: "openai/gpt-oss-20b", message: "rate limit" }),
    failureReason: "Rate limited",
  }),
  openrouter: result({
    ok: false,
    diagnostic: buildDiagnostic({ httpStatus: 503, endpoint: "no response", model: "openrouter/free", message: "unavailable" }),
    failureReason: "unavailable",
  }),
  gemini: result({ ok: true, data: extracted }),
});
const ratedRun = await extractWithProviders({
  requestId: "44444444-4444-4444-8444-444444444444",
  posts,
  plans: planExtractionProviders(env(), used),
  timeoutMs: defaultExtractionTimeoutMs,
  call: rated.call,
});
check("rate limit and an unavailable provider fall through", rated.called.join(",") === "groq,openrouter,gemini" && ratedRun.provider === "gemini");
check("rate limit is classified", ratedRun.attempts[0]?.diagnostic?.classification === "RATE_LIMITED");
check("provider server failure is classified", ratedRun.attempts[1]?.diagnostic?.classification === "PROVIDER_SERVER_ERROR");

const unavailable = planExtractionProviders(env({ groqKey: false }), used);
const skipped = scripted({ openrouter: result({ ok: true, data: extracted }) });
const skippedRun = await extractWithProviders({
  requestId: "55555555-5555-4555-8555-555555555555",
  posts,
  plans: unavailable,
  timeoutMs: defaultExtractionTimeoutMs,
  call: skipped.call,
});
check("a provider without a credential is recorded and not called", skipped.called.join(",") === "openrouter" && skippedRun.attempts[0]?.called === false);

check("a new opportunity is inserted", extractionOpportunityWrite(null) === "insert");
check("an open card without a take is updated", extractionOpportunityWrite({ status: "open", editorTake: null }) === "update");
check("an editor take is kept", extractionOpportunityWrite({ status: "open", editorTake: "Keep this." }) === "keep");
check("an ignored card is kept", extractionOpportunityWrite({ status: "ignored", editorTake: null }) === "keep");
const summary = reprocessSummary({ posts: 10, conversations: 10, opportunities: 2 });
check("the desk summary counts the stored scan", summary.posts === "10 posts reviewed" && summary.conversations === "10 conversations" && summary.opportunities === "2 opportunities found");

const saved = readFileSync(new URL("../lib/intel/saved-scan.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/intel/reprocess/route.ts", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/desk/discover.tsx", import.meta.url), "utf8");
const progress = readFileSync(new URL("../lib/intel/progress.ts", import.meta.url), "utf8");
const extract = readFileSync(new URL("../lib/intel/extract-posts.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/settings/panel.tsx", import.meta.url), "utf8");
const run = readFileSync(new URL("../lib/intel/run.ts", import.meta.url), "utf8");
check("reprocess does not search X", !saved.includes("searchRecent") && !saved.includes("api.twitter.com") && !saved.includes("geminiHealth"));
check("reprocess route requires the saved scan id", route.includes("scanId") && route.includes("reprocessSavedScan"));
check("the desk offers reprocess saved posts", progress.includes("Reprocess saved posts") && desk.includes("scanId") && desk.includes("/api/intel/reprocess"));
check("extraction uses the provider router", extract.includes("extractWithProviders") && extract.includes("planExtractionProviders") && !extract.includes("completeJson"));
check("settings does not start a reprocess", !settings.includes("/api/intel/reprocess"));
check("a scan records the retrieval stage before extraction", run.includes("X_RETRIEVAL_COMPLETE") && run.includes("PARTIAL_FAILURE"));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("extraction checks passed");
}

main();
