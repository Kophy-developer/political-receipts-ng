import { readFileSync } from "node:fs";
import { composeFromAnalysis } from "../lib/editorial/findings";
import { describeSource } from "../lib/editorial/quality";
import { chooseDocumentIds, documentLedger } from "../lib/research/examine";
import { extractDocument } from "../lib/research/extract";
import { investigate } from "../lib/research/investigate";
import { attemptDocumentRead, rejectionForSize } from "../lib/research/read-document";
import { describeContinuation } from "../lib/research/resume";
import { analyzeSeries } from "../lib/research/series";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const posts = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const pidgin = posts.posts.find((item) => item.text.includes("e tell me say"))?.text ?? "";
const investigation = investigate(pidgin, describeSource(pidgin));
const capitalHtml = readFileSync("scripts/fixtures/capital-importation.html", "utf8");
const capitalUrl = "https://www.nigerianstat.gov.ng/pdfuploads/Capital%20importation%20Q4%202023.pdf";
const stored = [
  ["514adb8c-c79b-488e-b0d4-0366f81f2522", "statehouse.gov.ng", "not_retrieved", "", "FG: TINUBU’S REFORMS DRIVING GLOBAL CONFIDENCE", "https://statehouse.gov.ng/fg-tinubus-reforms-driving-global-confidence-as-nigeria-strengthens-uk-partnership"],
  ["4f303aa8-de2c-4e43-a30b-368d79315e1a", "statehouse.gov.ng", "not_retrieved", "", "NIGERIA GAINING MORE GLOBAL RECOGNITION", "https://statehouse.gov.ng/nigeria-gaining-more-global-recognition-through-our-reforms-president-tinubu-says"],
  ["915f553d-d9c9-4a53-a81f-0fcefdee9b62", "statehouse.gov.ng", "not_retrieved", "", "PRESIDENT TINUBU MEETS VINCENT BOLLORÉ", "https://statehouse.gov.ng/president-tinubu-meets-vincent-bollore-in-paris"],
  ["179bfda2-b6cf-474c-bd89-93407adf46f5", "statehouse.gov.ng", "not_retrieved", "", "APM TERMINALS PRESIDENT PLEDGES FRESH $600M", "https://statehouse.gov.ng/apm-terminals-president-pledges-fresh-600m-investment"],
  ["f0c64dfe-1cdd-4c47-94f1-ceeccb3bad74", "statehouse.gov.ng", "not_retrieved", "", "SHELL GLOBAL CEO HAILS PRESIDENT TINUBU", "https://statehouse.gov.ng/shell-global-ceo-hails-president-tinubu"],
  ["3e73474f-e6b8-4d8b-a0fb-a7da68e26aa7", "nigerianstat.gov.ng", "not_retrieved", "", "Reports | National Bureau of Statistics", "https://www.nigerianstat.gov.ng/elibrary/read/1241396", "In Q2 2023, total capital importation into Nigeria stood at US$1,030.21 million"],
  ["5e2ea656-e7e6-4bc2-8b37-fd707e492be0", "nigerianstat.gov.ng", "not_retrieved", "", "Reports | National Bureau of Statistics", "https://www.nigerianstat.gov.ng/elibrary/read/1241308", "Categorization of Capital Importation by Banks"],
  ["dd9d2a4e-6a59-42f5-bc00-8b64cf5f7e02", "nigerianstat.gov.ng", "not_retrieved", "", "Reports | National Bureau of Statistics", "https://www.nigerianstat.gov.ng/elibrary/read/1241568", "In Q2 2024, total capital importation into Nigeria stood at US$2,604.50 million"],
  ["cd51bd52-91ca-46b5-b7ca-cde43d8beeb7", "nigerianstat.gov.ng", "not_retrieved", "", "Reports | National Bureau of Statistics", "https://nigerianstat.gov.ng/elibrary/read/1241527", "In Q1 2024, total capital importation into Nigeria stood at US$3,376.01 million"],
  ["0b0ceccc-5ecc-4a42-a7db-20f027c4ef1d", "nigerianstat.gov.ng", "not_retrieved", "", "Reports | National Bureau of Statistics", "https://www.nigerianstat.gov.ng/elibrary/read/1241111", "capital importation into Nigeria in the third quarter of 2021"],
  ["e04a5c63-0018-42d8-b075-1f5e5e910cd7", "unctadstat.unctad.org", "not_retrieved", "", "Country Profile | UNCTAD Data Hub", "https://unctadstat.unctad.org/country-profiles/theme/566/94", "Merchandise exports"],
  ["df8b7319-a83b-420d-93d0-a0cbd7b96dde", "unctad.org", "not_retrieved", "", "Foreign direct investment explorer | UN Trade and Development", "https://unctad.org/topic/investment/foreign-direct-investment-explorer", "Global foreign direct investment"],
  ["836e121b-7a6b-41be-9f8d-17b83178dc6e", "unctad.org", "not_retrieved", "", "Foreign direct investment trends in emerging markets", "https://unctad.org/system/files/official-document/diae2025d1_en.pdf", "Nigeria remains attractive"],
  ["27b46867-4ffe-4139-a9ab-7a4a72f738f7", "unctad.org", "not_retrieved", "", "World Investment Report 2024", "https://unctad.org/system/files/official-document/wir2024_en.pdf", "Nigeria opened its electricity sector"],
  ["89e99d7c-126d-4565-a436-c6921ba59374", "unctad.org", "not_retrieved", "", "FOREIGN DIRECT INVESTMENT IN AFRICA", "https://unctad.org/system/files/official-document/poiteiitm15.pdf", "Technical cooperation"],
  ["cc452e01-32d2-4a87-b3ee-42d8f2cc2bc4", "documents1.worldbank.org", "not_retrieved", "", "2022 Investment Policy and Regulatory Review", "https://documents1.worldbank.org/curated/en/099250201122328790/pdf/P17393802c4b840e50a637038b09da3478e.pdf", "capital imported into Nigeria"],
  ["448c355c-e0a0-47ec-bc2a-ca448c3266c6", "cbn.gov.ng", "not_retrieved", "", "CBN Reforms and Initiatives | Central Bank of Nigeria", "https://www.cbn.gov.ng/AboutCBN/Reforms.html", "foreign exchange"],
  ["9fa2aaaf-3943-4563-a27d-016e8810e12a", "cbn.gov.ng", "failed", "The file is too large to store an excerpt from.", "2020 Annual Economic Report", "https://www.cbn.gov.ng/out/2023/rsd/2020%20cbn%20annual%20report....pdf", "Capital Importation by Sector"],
  ["ede9ace9-cda1-42da-87b3-7c96f68ed958", "nigerianstat.gov.ng", "failed", "The page did not answer.", "Reports | National Bureau of Statistics", "https://www.nigerianstat.gov.ng/elibrary/read/1241568", "In Q2 2024, total capital importation into Nigeria stood at US$2,604.50 million"],
  ["dff429ab-4b6d-4d4a-8c63-071498ee1618", "nigerianstat.gov.ng", "not_retrieved", "", "Nigeria Capital Importation", capitalUrl, "In Q4 2023, total capital importation into Nigeria stood at US$1,088 million"],
].map(([id, domain, retrievalStatus, rejection, title, url, snippet]) => ({
  id, domain, retrievalStatus, rejection, title, url, snippet: snippet || "", inDomain: true,
}));

const first = chooseDocumentIds(stored, investigation, 2);
check("the selector chooses the capital importation PDF ahead of failed and irrelevant pages", first[0] === "dff429ab-4b6d-4d4a-8c63-071498ee1618" && !first.includes("9fa2aaaf-3943-4563-a27d-016e8810e12a") && !first.includes("ede9ace9-cda1-42da-87b3-7c96f68ed958") && first.every((id) => stored.find((item) => item.id === id)?.domain !== "statehouse.gov.ng"));
check("failed URLs are not selected again", !first.some((id) => stored.find((item) => item.id === id)?.url === "https://www.nigerianstat.gov.ng/elibrary/read/1241568"));
check("a duplicate of a failed URL is marked unavailable", documentLedger(stored, investigation, 2).find((item) => item.id === "dd9d2a4e-6a59-42f5-bc00-8b64cf5f7e02")?.status === "unavailable");

const openedOnce = stored.map((item) => item.id === first[0] ? { ...item, retrievalStatus: "retrieved" } : item);
const second = chooseDocumentIds(openedOnce, investigation, 2);
check("a repeated open does not select the document that was already retrieved", !second.includes(first[0]) && second.length <= 2);

const offer = describeContinuation({
  claim: pidgin,
  investigation,
  sources: stored.map((item) => ({ ...item, opened: item.retrievalStatus === "retrieved" })),
  runs: [{ hash: "a54f14ba580a994fc7880e893326e5d0e0aaf1a654c781cc7eac8bec5970501c", status: "completed", operations: 3 }],
  continuations: 2,
  searchCompleted: true,
  searchesUsed: 4,
  retrievalsUsed: 2,
});
check("the foreign-investment story offers the World Bank series and does not open a PDF", offer.available && offer.structuredId === "world-bank-ng-fdi-net-inflows" && offer.searches === 0 && offer.documents === 0 && offer.openIds.length === 0 && /World Bank/i.test(offer.why));
const capitalOffer = describeContinuation({
  claim: "Nigeria capital importation annual series",
  investigation: investigate("Nigeria capital importation annual series", describeSource("Nigeria capital importation annual series")),
  sources: stored.map((item) => ({ ...item, opened: item.retrievalStatus === "retrieved" })),
  runs: [{ hash: "a54f14ba580a994fc7880e893326e5d0e0aaf1a654c781cc7eac8bec5970501c", status: "completed", operations: 3 }],
  continuations: 2,
  searchCompleted: true,
  searchesUsed: 4,
  retrievalsUsed: 2,
});
check("a capital-importation question still offers the saved PDF and no new search", capitalOffer.structuredId === null && capitalOffer.available && capitalOffer.searches === 0 && capitalOffer.openIds[0] === "dff429ab-4b6d-4d4a-8c63-071498ee1618");

const ledger = documentLedger(stored, investigation, 2);
const pdfRow = ledger.find((item) => item.id === "dff429ab-4b6d-4d4a-8c63-071498ee1618");
const cbnRow = ledger.find((item) => item.id === "9fa2aaaf-3943-4563-a27d-016e8810e12a");
const houseRow = ledger.find((item) => item.domain === "statehouse.gov.ng");
check("the ledger records selected, unavailable, and irrelevant separately", pdfRow?.status === "selected" && cbnRow?.status === "unavailable" && /too large/.test(cbnRow?.reason || "") && houseRow?.status === "irrelevant");

const calls: string[] = [];
async function main() {
  const target = stored.find((item) => item.id === first[0]);
  const read = await attemptDocumentRead(target?.url || "", async (url) => {
    calls.push(url);
    return { contentType: "text/html", bytes: new TextEncoder().encode(capitalHtml) };
  });
  check("retrieval is attempted for the selected URL", read.attempted && calls.length === 1 && calls[0] === capitalUrl && read.ok);
  const parsed = extractDocument({ text: read.ok ? read.passage : "", url: capitalUrl, title: "Nigeria Capital Importation" });
  const analysis = analyzeSeries(parsed.observations, "capital importation");
  const draft = analysis?.chart ? composeFromAnalysis({ quality: describeSource(pidgin), analysis, domain: "nigerianstat.gov.ng" }) : "";
  check("the opened fixture parses into a chart and a draft", parsed.observations.length === 10 && analysis?.chart?.points.length === 10 && /\$5\.40bn/.test(draft) && /\$5\.00bn/.test(draft));
  check("the draft does not invent a year outside the opened table", [...draft.matchAll(/\b20\d\d\b/g)].every((match) => analysis?.observations.some((item) => String(item.year) === match[0])));

  const tooBig = await attemptDocumentRead("https://statehouse.gov.ng/fg-tinubus-reforms", async () => ({ contentType: "text/html", bytes: new Uint8Array(1_200_001) }));
  const silent = await attemptDocumentRead("https://www.nigerianstat.gov.ng/elibrary/read/1241568", async () => { throw new Error("timed out"); });
  check("a failed retrieval keeps the precise reason", tooBig.ok === false && tooBig.message === "Download too large" && tooBig.message === rejectionForSize(1_200_001) && silent.ok === false && silent.message === "Download failed. The page did not answer.");

  let repeatCalls = 0;
  const again = chooseDocumentIds(openedOnce, investigation, 2);
  if (again.includes(first[0])) repeatCalls += 1;
  check("a second click does not retrieve the same document", repeatCalls === 0);

  const pdf = new TextEncoder().encode([
    "%PDF-1.1",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
    "4 0 obj << /Length 88 >> stream",
    "BT (Capital importation USD million nominal 2024 | 6100) Tj ET",
    "endstream endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ].join("\n"));
  const fromPdf = await attemptDocumentRead(capitalUrl, async () => ({ contentType: "application/pdf", bytes: pdf }));
  const pdfParsed = extractDocument({ text: fromPdf.ok ? fromPdf.passage : "", url: capitalUrl, title: "Capital importation" });
  check("an accessible PDF text stream can be parsed", fromPdf.ok && pdfParsed.observations.some((item) => item.year === 2024 && item.value === 6100));

  const parsedLedger = documentLedger(stored.map((item) => item.id === first[0] ? { ...item, retrievalStatus: "retrieved", text: read.ok ? read.passage : "" } : item), investigation, 2);
  const parsedRow = parsedLedger.find((item) => item.id === first[0]);
  const emptyRow = documentLedger([{ ...stored[0], id: "opened-empty", retrievalStatus: "retrieved", text: "A press note with no table.", url: "https://www.nigerianstat.gov.ng/note", title: "Note", domain: "nigerianstat.gov.ng" }], investigation, 2)[0];
  check("opened data records parse succeeded and a page without a series records parse failed", parsedRow?.status === "parse succeeded" && emptyRow?.status === "parse failed");

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("research retrieval checks passed");
}

main();
