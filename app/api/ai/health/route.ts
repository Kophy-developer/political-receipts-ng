import { EDITORIAL_REJECTION, planProvider, providerLabels, type ProviderId } from "@/lib/ai/catalog";
import { generateStructuredContent } from "@/lib/ai/route";
import { readAiEnv } from "@/lib/ai/runtime";
import { callProvider } from "@/lib/ai/transport";
import { calledToday, persistAttempts } from "@/lib/db/ai-attempts";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 30;

const providers = new Set<ProviderId>(["groq", "openrouter", "gemini"]);

const geminiSchema = { type: "OBJECT", required: ["ok"], properties: { ok: { type: "BOOLEAN" } } };
const chatSchema = { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } };

function skipMessage(provider: ProviderId, reason: string | null) {
  const name = providerLabels[provider];
  if (reason === "no credential") return `${name} has no credential. No request was sent.`;
  if (reason === "paid route blocked") return `${name} is a paid route. No request was sent while AI paid usage is off.`;
  if (reason === "daily allowance exhausted") return `${name} has reached today's allowance. No request was sent.`;
  if (reason === "configured model is not usable") return `${name}'s configured model is not usable. No request was sent.`;
  return `${name} was not called.`;
}

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { provider?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const provider = typeof body.provider === "string" && providers.has(body.provider as ProviderId) ? (body.provider as ProviderId) : null;
  if (!provider) return Response.json({ ok: false, message: "Choose one provider to test." }, { status: 400 });
  const env = readAiEnv();
  const used = await calledToday();
  const plan = planProvider(provider, env, used[provider]);
  const routed = await generateStructuredContent({
    task: "health",
    systemPrompt: "Reply with a tiny JSON object. This is a connectivity check.",
    userPrompt: 'Reply with {"ok":true}. Do not mention news, people, or places.',
    schema: provider === "gemini" ? geminiSchema : chatSchema,
    timeoutMs: 15_000,
    plans: [plan],
    rejectionReason: EDITORIAL_REJECTION,
    accept: (data) => (data && typeof data === "object" && (data as { ok?: unknown }).ok === true ? "success" : "malformed"),
    call: (item, providerRequest) => callProvider(item, providerRequest, { maxTokens: 64, temperature: 0 }),
  });
  const requestId = crypto.randomUUID();
  await persistAttempts(routed.attempts.map((attempt) => ({ ...attempt, requestId, task: "health" as const })));
  const attempt = routed.attempts[0];
  if (!attempt?.called) {
    return Response.json({
      ok: false,
      called: false,
      provider,
      model: plan.model,
      message: skipMessage(provider, attempt?.failureReason ?? plan.skipReason),
    });
  }
  const consumed = "This check used one request.";
  return Response.json({
    ok: routed.ok,
    called: true,
    provider,
    model: plan.model,
    message: routed.ok ? `Available. ${consumed}` : `${attempt.failureReason ?? "The check failed."} ${consumed}`,
  });
}
