import {
  defaultModels,
  EDITORIAL_REJECTION,
  isFreeOpenRouter,
  planDraftProviders,
  planProvider,
  type AiEnv,
  type ProviderId,
} from "../lib/ai/catalog";
import { generateStructuredContent, type ProviderCallResult, type ProviderPlan, type ProviderRequest } from "../lib/ai/route";
import { draftWithProviders } from "../lib/drafts/chain";
import type { DraftBrief } from "../lib/drafts/rules";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const brief: DraftBrief = {
  claim: "An X post says INEC created 453 polling units for AI-created registered voters.",
  postText: "INEC secretly created 453 new Polling Unity where the AI created registered voters will now vote.",
  verdict: "NEEDS CONTEXT",
  confidence: "Moderate",
  angleTitle: "The real story is already serious",
  anglePoints: ["Suspected AI-generated photographs in a preliminary voter register are already serious."],
  take: null,
  evidence: [
    { kind: "primary record", label: "INEC polling-unit page", note: "The page does not record 453 new units.", url: "https://inecnigeria.org/polling-units" },
    { kind: "independent reporting", label: "BBC News Pidgin", note: "INEC explains suspected AI-generated images.", url: "https://www.bbc.com/pidgin/articles/c6gelpr1qq29o" },
  ],
};

const conversational = "I went looking for the 453 polling units. Credible reporting describes suspected AI-generated photographs in the preliminary voter register, and INEC responded. We could not establish that claim. The photo problem is already serious enough.";
const punchy = "This story is already serious enough. Suspected AI photographs showed up in the preliminary voter register. INEC responded. The 453 polling units? We could not establish that from the evidence reviewed.";
const analytical = "Here's the part that bothers me. Suspected AI-generated photographs in a preliminary voter register are a real problem, and INEC responded. I still cannot tie that to 453 new polling units. The records we reviewed do not establish it.";
const opening = "I went looking for 453 polling units created for AI-generated voters.";
const followA = "Credible reporting describes suspected AI-generated photographs in the preliminary voter register. INEC responded to the irregularities.";
const followB = "That is separate from 453 polling units. We could not establish that claim. The photograph problem does not need the extra number to matter.";

const good = {
  conversational: { text: conversational, hashtag: "#CheckAm" },
  punchy: { text: punchy, hashtag: "#CheckAm" },
  analytical: { text: analytical, hashtag: "#CheckAm" },
  thread: { opening, posts: [followA, followB], hashtag: "#CheckAm" },
};

const badText = "453 is false. INEC never created 453 polling units, the account lied, and AI-generated voters voted. The final certified register contained the irregularities. #NotTrue";
const bad = {
  conversational: { text: badText, hashtag: "#NotTrue" },
  punchy: { text: badText, hashtag: "#NotTrue" },
  analytical: { text: badText, hashtag: "#NotTrue" },
  thread: { opening: badText, posts: [badText], hashtag: "#NotTrue" },
};

function baseEnv(overrides: Partial<AiEnv> = {}): AiEnv {
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

function ok(data: unknown, extra: Partial<ProviderCallResult> = {}): ProviderCallResult {
  return { ok: true, data, failureReason: null, diagnostic: null, inputTokens: 11, outputTokens: 22, estimatedCostUsd: 0, ...extra };
}

function fail(reason: string): ProviderCallResult {
  return { ok: false, failureReason: reason, diagnostic: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null };
}

function clock() {
  let time = Date.parse("2026-11-04T16:00:00.000Z");
  return () => {
    const current = time;
    time += 25;
    return current;
  };
}

async function run(env: AiEnv, used: Record<ProviderId, number>, handlers: Partial<Record<ProviderId, (plan: ProviderPlan) => Promise<ProviderCallResult>>>, style?: "punchy") {
  const seen: ProviderId[] = [];
  const requests: ProviderRequest[] = [];
  const counts: Record<ProviderId, number> = { groq: 0, openrouter: 0, gemini: 0 };
  const result = await draftWithProviders({
    requestId: "11111111-1111-4111-8111-111111111111",
    task: style ? "draft_regenerate" : "draft",
    brief,
    style,
    plans: planDraftProviders(env, used),
    timeoutMs: 18000,
    now: clock(),
    call: async (plan, request) => {
      counts[plan.id] += 1;
      if (counts[plan.id] > 1) throw new Error(`retried ${plan.id}`);
      seen.push(plan.id);
      requests.push(request);
      const handler = handlers[plan.id];
      if (!handler) throw new Error(`unexpected ${plan.id}`);
      return handler(plan);
    },
  });
  return { result, seen, requests };
}

async function main() {
  const zero = { groq: 0, openrouter: 0, gemini: 0 };
  const defaults = planDraftProviders(baseEnv(), zero);
  check("groq default is the published free model", defaults[0]?.model === defaultModels.groq && defaults[0]?.model === "openai/gpt-oss-20b");
  check("openrouter default is the free router", defaults[1]?.model === "openrouter/free" && isFreeOpenRouter(defaults[1].model));
  check("gemini default stays the extraction model", defaults[2]?.model === "gemini-3.8-flash");
  check("paid usage off still allows the free defaults", defaults.every((plan) => plan.callable));

  const paidRouter = planProvider("openrouter", baseEnv({ openrouterModel: "openai/gpt-4o" }), 0);
  check("configured paid openrouter model is blocked", paidRouter.callable === false && paidRouter.skipReason === "paid route blocked");
  const paidAllowed = planProvider("openrouter", baseEnv({ openrouterModel: "openai/gpt-4o", paidUsage: true }), 0);
  check("explicit paid usage can select that openrouter model", paidAllowed.callable && paidAllowed.model === "openai/gpt-4o");
  const freeSuffix = planProvider("openrouter", baseEnv({ openrouterModel: "example/model:free" }), 0);
  check("an explicit free-suffix model stays available", freeSuffix.callable && freeSuffix.model.endsWith(":free"));
  const paidGroq = planProvider("groq", baseEnv({ groqModel: "llama-3.3-70b-versatile" }), 0);
  check("groq models outside the free list are blocked", paidGroq.callable === false && paidGroq.skipReason === "paid route blocked");
  const geminiSpent = planProvider("gemini", baseEnv(), 8);
  check("gemini daily allowance is its own stop", geminiSpent.skipReason === "daily allowance exhausted");
  check("groq remains available when gemini is spent", planProvider("groq", baseEnv(), 0).callable);

  const groqSuccess = await run(baseEnv(), zero, { groq: () => Promise.resolve(ok(good)) });
  check("groq success returns all four styles", groqSuccess.result.outcome === "saved" && groqSuccess.result.drafts.length === 4);
  check("groq success stops the chain", groqSuccess.seen.join(",") === "groq");
  check("one request carries every style", JSON.stringify(groqSuccess.requests[0]?.schema).includes("conversational") && JSON.stringify(groqSuccess.requests[0]?.schema).includes("thread"));
  check("the prompt keeps the verdict and the evidence", (groqSuccess.requests[0]?.userPrompt.includes("NEEDS CONTEXT") ?? false) && (groqSuccess.requests[0]?.userPrompt.includes("https://www.bbc.com/pidgin/articles/c6gelpr1qq29o") ?? false));
  check("groq success records tokens and the free estimate", groqSuccess.result.attempts[0]?.status === "success" && groqSuccess.result.attempts[0]?.inputTokens === 11 && groqSuccess.result.attempts[0]?.estimatedCostUsd === 0);

  const rateLimited = await run(baseEnv(), zero, {
    groq: () => Promise.resolve(fail("rate limited")),
    openrouter: () => Promise.resolve(ok(good)),
  });
  check("429 falls through to openrouter", rateLimited.seen.join(",") === "groq,openrouter");
  check("openrouter success stops before gemini", rateLimited.result.provider === "openrouter" && rateLimited.result.outcome === "saved");
  check("both attempts share one editor action", rateLimited.result.attempts.every((attempt) => attempt.requestId === rateLimited.result.requestId) && rateLimited.result.attempts.length === 2);
  check("the rate limit is recorded", rateLimited.result.attempts[0]?.called === true && rateLimited.result.attempts[0]?.failureReason === "rate limited");
  check("the two prompts are the same", rateLimited.requests[0]?.userPrompt === rateLimited.requests[1]?.userPrompt && rateLimited.requests[0]?.evidence === rateLimited.requests[1]?.evidence);

  const unavailable = await run(baseEnv(), zero, {
    groq: () => Promise.resolve(fail("unavailable")),
    openrouter: () => Promise.resolve(ok(good)),
  });
  check("an unavailable groq falls through once", unavailable.seen.join(",") === "groq,openrouter" && unavailable.result.outcome === "saved");

  const toGemini = await run(baseEnv({ groqKey: false, openrouterKey: false }), zero, {
    gemini: () => Promise.resolve(ok(good, { estimatedCostUsd: null })),
  });
  check("gemini runs when the first two have no credential", toGemini.seen.join(",") === "gemini" && toGemini.result.provider === "gemini");
  check("skipped providers are recorded and not called", toGemini.result.attempts.filter((attempt) => attempt.provider !== "gemini").every((attempt) => attempt.called === false));

  const none = await run(baseEnv({ groqKey: false, openrouterKey: false, geminiKey: false }), zero, {});
  check("no provider means the draft is unavailable", none.result.outcome === "unavailable" && none.seen.length === 0 && none.result.attempts.length === 3);

  const malformed = await run(baseEnv(), zero, {
    groq: () => Promise.resolve(ok({ note: "not a draft" })),
    openrouter: () => Promise.resolve(ok(good)),
  });
  check("malformed JSON tries the next provider", malformed.seen.join(",") === "groq,openrouter" && (malformed.result.attempts[0]?.failureReason?.includes("INVALID_RESPONSE") ?? false));

  const thrown = await run(baseEnv(), zero, {
    groq: () => Promise.reject(new Error("socket")),
    openrouter: () => Promise.resolve(ok(good)),
  });
  check("a thrown provider error tries the next provider once", thrown.seen.join(",") === "groq,openrouter" && (thrown.result.attempts[0]?.failureReason?.includes("NETWORK_ERROR") ?? false));

  const rejected = await run(baseEnv(), zero, {
    groq: () => Promise.resolve(ok(bad)),
    openrouter: () => Promise.resolve(ok(good)),
  });
  check("editorial rejection does not shop for wording", rejected.seen.join(",") === "groq" && rejected.result.outcome === "rejected");
  check("the rejection uses the required mark", rejected.result.message === EDITORIAL_REJECTION && rejected.result.attempts[0]?.status === "rejected");
  check("not-true wording is part of that rejection", rejected.result.problems.some((problem) => /#NotTrue|453 is false|lied|never created|voted|final certified/i.test(problem.reason)));

  const paidBlocked = await run(baseEnv({ openrouterModel: "openai/gpt-4o" }), zero, {
    groq: () => Promise.resolve(fail("unavailable")),
    gemini: () => Promise.resolve(ok(good, { estimatedCostUsd: null })),
  });
  check("a paid openrouter model is not called while paid usage is off", paidBlocked.seen.join(",") === "groq,gemini");
  check("the paid skip is recorded on the same action", paidBlocked.result.attempts.some((attempt) => attempt.provider === "openrouter" && attempt.called === false && attempt.failureReason === "paid route blocked"));

  const geminiHeld = await run(baseEnv(), { groq: 0, openrouter: 0, gemini: 8 }, {
    groq: () => Promise.resolve(ok(good)),
  });
  check("gemini's spent allowance does not block groq", geminiHeld.seen.join(",") === "groq" && geminiHeld.result.outcome === "saved");

  const timedOut = await run(baseEnv(), zero, {
    groq: () => Promise.resolve(fail("timed out")),
    openrouter: () => Promise.resolve(fail("timed out")),
    gemini: () => Promise.resolve(ok(good, { estimatedCostUsd: null })),
  });
  check("timeouts continue and a later success stops the chain", timedOut.seen.join(",") === "groq,openrouter,gemini" && timedOut.result.provider === "gemini");

  let repeated = 0;
  await generateStructuredContent({
    task: "draft",
    systemPrompt: "same",
    userPrompt: "same",
    schema: { type: "object" },
    timeoutMs: 1000,
    plans: [defaults[0]!, defaults[0]!],
    rejectionReason: EDITORIAL_REJECTION,
    accept: () => "success",
    call: async () => {
      repeated += 1;
      return ok(good);
    },
  });
  check("the same provider is not attempted twice", repeated === 1);

  const oneStyle = await run(baseEnv(), zero, { groq: () => Promise.resolve(ok({ text: punchy, hashtag: "" })) }, "punchy");
  check("one style is still one provider request", oneStyle.seen.join(",") === "groq" && oneStyle.result.drafts.length === 1 && oneStyle.requests[0]?.userPrompt.includes("Write only the punchy"));

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("ai route checks passed");
}

void main();
