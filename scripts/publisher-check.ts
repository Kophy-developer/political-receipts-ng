import { readFileSync } from "node:fs";
import { caveatsFromDevelopment, draftsFromDevelopment, noticeFor, readyItemFromRow } from "../lib/publisher/read";
import {
  parseApprovalText,
  parseRephraseRequest,
  rephraseSystemPrompt,
  rephraseUserPrompt,
  textFromRephrase,
} from "../lib/publisher/rephrase";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const development = {
  ready: true,
  angle: "2016 to 2025 and 2023 to 2025 are different windows.",
  drafts: [
    { text: "About 16% from 2016 to 2025. About 113.9% from 2023 to 2025.", style: "punchy", sourceHash: "b894" },
    { text: "Foreign direct investment, net inflows stood at $3.45bn in 2016 and $4.01bn in 2025.", style: "analytical", sourceHash: "b894" },
  ],
  analysis: {
    url: "https://data.worldbank.org/indicator/BX.KLT.DINV.CD.WD?locations=NG",
    chart: { url: "https://data.worldbank.org/indicator/BX.KLT.DINV.CD.WD?locations=NG" },
    limits: ["This is not capital importation.", "It does not name a cause."],
  },
};

const drafts = draftsFromDevelopment(development);
check("ready drafts keep their styles", drafts.length === 2 && drafts[0]?.style === "punchy" && drafts[1]?.style === "analytical");
check("caveats stay short and concrete", caveatsFromDevelopment(development, null).includes("This is not capital importation."));

const item = readyItemFromRow({
  id: "d535ff58-b2ba-4d09-8d91-5c8312d4364d",
  claimId: "62712cf1-92a5-4303-bc85-316ff3956238",
  pillar: "politics",
  claim: "foreign companies don Dey invest in Nigeria because of tinubu and our economy is the best it has ever been",
  whatHappened: "Someone made a claim about investment.",
  possibleAngle: "Foreign direct investment, net inflows, is not the whole economy.",
  development,
  updatedAt: "2026-11-08T12:00:00.000Z",
});
check("a ready opportunity becomes an approval item", Boolean(item && item.drafts.length === 2 && item.sourceUrl?.includes("worldbank")));
check("an unfinished development is not queued", readyItemFromRow({
  id: "x",
  claimId: "y",
  pillar: "finance",
  claim: "claim",
  whatHappened: null,
  possibleAngle: null,
  development: { ready: false, drafts: [{ text: "Not ready", style: "punchy" }] },
  updatedAt: null,
}) === null);

check("the notice names the count", noticeFor(1).message === "1 draft is ready for you." && noticeFor(0).message === "No drafts are waiting.");

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../lib/nav.ts", import.meta.url), "utf8");
const desk = readFileSync(new URL("../app/desk/page.tsx", import.meta.url), "utf8");
const queue = readFileSync(new URL("../components/publisher/queue.tsx", import.meta.url), "utf8");
const publish = readFileSync(new URL("../app/api/x/publish/route.ts", import.meta.url), "utf8");
const prepare = readFileSync(new URL("../app/api/publisher/prepare/route.ts", import.meta.url), "utf8");

check("home is the approval queue", home.includes("ApprovalQueue") && home.includes("listReadyForApproval"));
check("the menu is Approve, Published, Settings", nav.includes('label: "Approve"') && nav.includes('label: "Published"') && nav.includes('label: "Settings"') && !nav.includes('label: "Desk"') && !nav.includes('label: "Intelligence"'));
check("the old desk page redirects home", desk.includes('redirect("/")'));
check("approve still requires exact confirmation", queue.includes("confirm: true") && queue.includes("Publish this exact text"));
check("the queue lets you edit the draft text", queue.includes('value={text}') && queue.includes("Draft text") && queue.includes("Restore prepared draft"));
check("the queue can send a voice or typed rewrite instruction", queue.includes("/api/publisher/rephrase") && queue.includes("Speak instruction") && queue.includes("Rewrite with AI"));
check("publish still validates confirm", publish.includes("validatePublishRequest") && prepare.includes("prepareApprovalDraft") && readFileSync(new URL("../lib/x/publish.ts", import.meta.url), "utf8").includes("input.confirm !== true"));
check("reject does not call X", !readFileSync(new URL("../app/api/publisher/reject/route.ts", import.meta.url), "utf8").includes("publishApprovedPost"));

const rephraseRoute = readFileSync(new URL("../app/api/publisher/rephrase/route.ts", import.meta.url), "utf8");
check("rephrase refuses empty instructions", !parseRephraseRequest({ text: "A draft.", instruction: "  " }).ok);
check("rephrase keeps the draft and instruction", (() => {
  const parsed = parseRephraseRequest({ text: "FDI rose.", instruction: "Make it shorter.", claim: "claim", caveats: ["Not capital importation."] });
  return parsed.ok && parsed.value.text === "FDI rose." && parsed.value.instruction === "Make it shorter." && parsed.value.caveats?.[0] === "Not capital importation.";
})());
check("rephrase prompts forbid invented numbers", rephraseSystemPrompt().includes("Do not invent new statistics") && rephraseUserPrompt({ text: "Draft", instruction: "Shorter" }).includes("Editor instruction: Shorter"));
check("rephrase reads only the rewritten text", textFromRephrase({ text: " Shorter post. " }) === "Shorter post." && textFromRephrase({ text: "  " }) === null);
check("approve text can be edited before prepare", parseApprovalText("  Edited exact text.  ").ok && (parseApprovalText("  Edited exact text.  ") as { ok: true; text: string }).text === "Edited exact text." && !parseApprovalText("   ").ok);
check("rephrase never opens the X publish gate", !rephraseRoute.includes("/api/x/publish") && !rephraseRoute.includes("publishApprovedPost") && rephraseRoute.includes("Nothing was published"));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("publisher checks passed");
