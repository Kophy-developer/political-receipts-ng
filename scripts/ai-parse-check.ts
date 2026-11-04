import { buildDiagnostic, shownProviderStatus } from "../lib/ai/diagnostics";
import { healthObjectOk, parseStructuredObject, readChatGenerated, readGeminiGenerated, responseShape } from "../lib/ai/structured";
import { acceptDraftPayload } from "../lib/drafts/chain";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function chat(content: unknown, finish = "stop") {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content } }],
    usage: { prompt_tokens: 12, completion_tokens: 4 },
  };
}

const raw = readChatGenerated(chat('{"ok":true}'));
check("raw assistant JSON is read from the first choice", healthObjectOk(raw.data) && raw.choiceCount === 1 && raw.finishReason === "stop" && raw.contentType === "string");
check("the chat envelope itself is not treated as the health object", healthObjectOk(readChatGenerated({ ok: true, id: "chatcmpl-test", choices: [] }).data) === false);

const fenced = readChatGenerated(chat("```json\n{\"ok\":true}\n```"));
check("fenced assistant JSON parses", healthObjectOk(fenced.data));

const spaced = readChatGenerated(chat('\n  {"ok": true}\n'));
check("whitespace around assistant JSON parses", healthObjectOk(spaced.data));

const channels = readChatGenerated(chat('analysisThe example {"ok": false} is not the answer.final{"ok":true}'));
check("a later assistant object wins over an earlier example", healthObjectOk(channels.data));

const invalid = readChatGenerated(chat("{ok:true}"));
check("invalid JSON is rejected", invalid.data === null && invalid.contentType === "string" && invalid.contentLength > 0);

const empty = readChatGenerated(chat(""));
check("empty assistant content is rejected", empty.data === null && empty.contentLength === 0 && empty.contentPreview === null);

const missing = readChatGenerated({ id: "chatcmpl-test", object: "chat.completion", usage: {} });
check("missing choices are rejected", missing.choiceCount === 0 && missing.data === null && missing.contentType === "missing");

const negative = readChatGenerated(chat('{"ok":false}'));
check("ok false is parsed and is not a health success", negative.data?.ok === false && healthObjectOk(negative.data) === false);

const parts = readChatGenerated(chat([
  { type: "reasoning", text: '{"ok":false}' },
  { type: "text", text: '{"ok":true}' },
]));
check("text parts are used and reasoning parts are not", healthObjectOk(parts.data) && parts.contentType === "array");

const already = readChatGenerated(chat({ ok: true }));
check("assistant content that is already an object is used", healthObjectOk(already.data) && already.contentType === "object");

const conversational = "I went looking for the 453 polling units. Credible reporting describes suspected AI-generated photographs in the preliminary voter register, and INEC responded. We could not establish that claim. The photo problem is already serious enough.";
const punchy = "This story is already serious enough. Suspected AI photographs showed up in the preliminary voter register. INEC responded. The 453 polling units? We could not establish that from the evidence reviewed.";
const analytical = "Here's the part that bothers me. Suspected AI-generated photographs in a preliminary voter register are a real problem, and INEC responded. I still cannot tie that to 453 new polling units. The records we reviewed do not establish it.";
const opening = "I went looking for 453 polling units created for AI-generated voters.";
const followA = "Credible reporting describes suspected AI-generated photographs in the preliminary voter register. INEC responded to the irregularities.";
const followB = "That is separate from 453 polling units. We could not establish that claim. The photograph problem does not need the extra number to matter.";
const drafts = {
  conversational: { text: conversational, hashtag: "#CheckAm" },
  punchy: { text: punchy, hashtag: "#CheckAm" },
  analytical: { text: analytical, hashtag: "#CheckAm" },
  thread: { opening, posts: [followA, followB], hashtag: "#CheckAm" },
};
const drafted = readChatGenerated(chat(JSON.stringify(drafts)));
check("a four-draft payload is extracted from assistant content", drafted.data?.conversational !== undefined && drafted.data.punchy !== undefined && drafted.data.analytical !== undefined && drafted.data.thread !== undefined);
check("that payload still has to pass the editorial validator", acceptDraftPayload(drafted.data) === "success");

const badDraft = readChatGenerated(chat('{"note":"not a draft"}'));
check("malformed draft JSON is not accepted as four styles", badDraft.data?.note === "not a draft" && acceptDraftPayload(badDraft.data) === "malformed");

const gemini = readGeminiGenerated({
  candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: '{"ok":false}' }, { text: '```json\n{"ok":true}\n```' }] } }],
});
check("gemini uses generated part text, not its envelope", healthObjectOk(gemini.data) && gemini.envelope.startsWith("object:"));

const shape = responseShape(invalid);
const diagnostic = buildDiagnostic({
  httpStatus: 200,
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  model: "openai/gpt-oss-20b",
  invalidResponse: true,
  shape,
  message: "The assistant content was not a JSON object.",
});
check("an unparsed 200 stays unverified", shownProviderStatus({
  credential: true,
  callable: true,
  skipReason: null,
  used: 3,
  limit: 40,
  latest: { status: "failure", reason: diagnostic.message, diagnostic },
}) === "UNVERIFIED");
check("the invalid-response diagnostic describes the envelope without storing a prompt", diagnostic.shape?.envelope === "object:id,object,choices,usage" && diagnostic.shape.contentType === "string" && (diagnostic.shape.contentPreview?.includes("{ok:true}") ?? false));
check("direct invalid JSON stays invalid", parseStructuredObject("{ok:true}") === null);
check("a short preview is capped", (responseShape(readChatGenerated(chat("x".repeat(500)))).contentPreview?.length ?? 0) <= 300);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ai parse checks passed");
