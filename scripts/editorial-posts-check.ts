import { readFileSync } from "node:fs";
import { chartScale, formatInvestment, provenanceSentence } from "../lib/editorial/money";
import { composeEditorialPosts, validateEditorialPosts } from "../lib/editorial/posts";
import { describeSource } from "../lib/editorial/quality";
import { initialDevelopment, judgeDevelopmentDrafts } from "../lib/editorial/develop";
import { interpretOfficialResponse, sourceRegistry } from "../lib/research/official-series";
import { analyzeSeries } from "../lib/research/series";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const fixture = JSON.parse(readFileSync("scripts/fixtures/world-bank-ng-fdi.json", "utf8"));
const dataset = sourceRegistry.find((item) => item.id === "world-bank-ng-fdi-net-inflows");
const read = dataset ? interpretOfficialResponse(fixture, dataset) : null;
const analysis = read?.ok ? analyzeSeries(read.observations, "foreign direct investment") : null;
const posts = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const pidgin = posts.posts.find((item) => item.text.includes("e tell me say"))?.text ?? "";
const quality = describeSource(pidgin);
const drafts = analysis ? composeEditorialPosts({ quality, analysis }) : [];
const judged = analysis ? validateEditorialPosts(analysis, quality, drafts) : null;
const state = analysis ? { ...initialDevelopment(pidgin), analysis, evidenceStatus: "EVIDENCE_READY" as const } : null;

check("three distinct posts come from the saved FDI observations", drafts.length === 3 && new Set(drafts.map((item) => item.text)).size === 3 && judged?.ok === true);
check("the posts use the two windows and stay short", drafts.every((item) => item.text.length < 900) && drafts.some((item) => /16%/.test(item.text) && /113\.9%/.test(item.text)) && drafts.some((item) => /\$3\.45bn/.test(item.text) && /\$4\.01bn/.test(item.text)));
check("the posts do not dump research metadata or a cause", drafts.every((item) => !/live world bank|retrieved_at|cached official|parser|data\.worldbank|not a verdict|\d{10,}|because of tinubu|companies leaving/i.test(item.text)));
check("a disclaimer with a domain is not a passing draft", analysis && state ? judgeDevelopmentDrafts(state, [{ text: "This is unverified. data.worldbank.org" }]).ok === false : false);
check("exact observations remain exact while the reading is in billions", analysis?.observations.some((item) => item.year === 2016 && item.value === 3453258407.9848 && formatInvestment(item.value, item.unit) === "$3.45bn") === true && analysis?.observations.some((item) => item.year === 2022 && item.value < 0 && formatInvestment(item.value, item.unit).startsWith("−$")) === true);

const values = analysis?.chart?.points.map((point) => point.value) ?? [];
const scale = chartScale(values);
check("the chart scale keeps the negative year below zero", values.some((value) => value < 0) && scale.dataMin < 0 && scale.min < scale.dataMin && scale.includesZero && scale.max > scale.dataMax);

check("a live retrieval keeps its stored time", provenanceSentence({ origin: "live", live: true, sourceUpdated: "2026-10-08", retrievedAt: "2026-11-08T10:25:29.260Z" }).startsWith("Live World Bank response, received 2026-11-08T10:25:29.260Z"));
check("saved data is not described as a live retrieval", /not a live retrieval/i.test(provenanceSentence({ origin: "recorded", live: false, sourceUpdated: "2026-10-08", retrievedAt: null })) && !/received /.test(provenanceSentence({ origin: "recorded", live: false, sourceUpdated: "2026-10-08", retrievedAt: null })));

if (failures.length) {
  console.error(failures.join("\n"));
  if (drafts.length) console.error(drafts.map((item) => `\n[${item.style}]\n${item.text}`).join("\n"));
  process.exit(1);
}
console.log("editorial post checks passed");
