import { deflateSync } from "node:zlib";
import { executeStage } from "../lib/research/execute";
import { describeCandidate, rankSearchResults, type SearchResultDraft } from "../lib/research/inventory";
import { extractPdfDocument } from "../lib/research/pdf-text";
import { draftIsStorable, prepareEvidenceDraft } from "../lib/research/passage";
import type { SourceCategory } from "../lib/research/types";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const politics: SourceCategory[] = [
  { rank: 1, name: "Primary record", notes: "The office that owns the record.", domains: ["inecnigeria.org"] },
  { rank: 4, name: "Context", notes: "Social pages stay here.", domains: [] },
];

const claim = "An X post says INEC created 453 polling units for AI-created registered voters.";
const questions = [
  "Did INEC create or add 453 polling units?",
  "Is there authoritative evidence that those polling units were created for AI-generated or fake registered voters?",
  "If 453 is a real figure, what exactly does that number represent?",
];
const searches = [
  { query: "453 polling units", question: questions[0], problem: "record", domains: ["inecnigeria.org"] },
  { query: "artificial intelligence voter register generated photographs", question: questions[1], problem: "allegation", domains: ["inecnigeria.org"] },
  { query: "453 registration centres wards constituencies", question: questions[2], problem: "record", domains: ["inecnigeria.org"] },
];

function hit(queryIndex: number, rank: number) {
  const ordinary = queryIndex !== 2 || rank !== 5;
  return {
    url: `https://inecnigeria.org/${queryIndex + 1}/${rank}`,
    title: ordinary ? `INEC notice ${queryIndex + 1}-${rank}` : "453 registration centres",
    description: ordinary
      ? "The commission published a general notice about elections."
      : "INEC listed 453 registration centres. These centres are not described as polling units.",
    published: ordinary ? "2019-01-01" : "2025-06-01",
  };
}

const opened: string[] = [];

async function main() {
  const run = await executeStage({
    stage: "primary",
    domains: ["inecnigeria.org"],
    categories: politics,
    searches,
    search: async (_query) => {
      const queryIndex = searches.findIndex((item) => item.query === _query);
      return { ok: true, hits: [1, 2, 3, 4, 5].map((rank) => hit(queryIndex, rank)), credits: 1 };
    },
  });
  check("three searches return fifteen results", run.inventory.length === 15);
  check("each query keeps five ranks", [0, 1, 2].every((index) => run.inventory.filter((item) => item.queryIndex === index).map((item) => item.resultRank).join(",") === "1,2,3,4,5"));
  check("metadata survives for every result", run.inventory.every((item) => item.url.startsWith("https://inecnigeria.org/") && item.title && item.snippet && item.targetTier === "Primary record" && item.inDomain && item.retrievalStatus === "not_retrieved"));
  check("search rank does not open a document", run.documentsSelected === 0 && opened.length === 0);

  const retained = new Map<string, SearchResultDraft>();
  for (const row of run.inventory) retained.set(`${row.query}#${row.resultRank}`, row);
  check("inventory map keeps all fifteen", retained.size === 15);

  const ranked = rankSearchResults({ claim, questions, results: run.inventory, recommend: 2 });
  check("ranking still holds every result", ranked.length === 15);
  const best = ranked[0];
  const first = ranked.find((item) => item.queryIndex === 0 && item.resultRank === 1);
  check("a later query can outrank the first result", best.query === searches[2].query && best.resultRank === 5 && best.queryIndex === 2 && best.score > (first?.score ?? 0));
  check("the first hit of the first query is not first merely because it arrived first", first !== best);
  check("recommendation is explicit and limited to two", ranked.filter((item) => item.recommended).length === 2 && best.recommended);
  check("recommendation explains the figure", describeCandidate(best).includes("453") && best.reason.includes("453"));
  check("recommendation does not mark a result retrieved", ranked.every((item) => item.retrievalStatus === "not_retrieved"));

  const dirty = prepareEvidenceDraft({
    sourceId: "source-fixture",
    text: "Section 40 says the Commission shall establish an adequate number of polling units.\u0000\u0001 noise",
    pageLabel: "p. 23",
    relationship: "contextualizes",
    question: "Did INEC create or add 453 polling units?",
    notes: "Fixture passage.\u0000",
  });
  const memory = new Map<string, typeof dirty>();
  if (draftIsStorable(dirty)) memory.set(dirty.sourceId, dirty);
  const stored = memory.get("source-fixture");
  check("a null byte does not block the passage", Boolean(stored));
  check("stored passage keeps the readable sentence", Boolean(stored?.excerpt.includes("adequate number of polling units")) && !stored?.excerpt.includes("\u0000"));
  check("stored passage keeps the page", stored?.pageLabel === "p. 23");
  check("stored passage keeps the relationship", stored?.relationship === "contextualizes");
  check("stored passage keeps review status", stored?.reviewStatus === "proposed");
  check("stored passage keeps the research question", stored?.question === "Did INEC create or add 453 polling units?");
  check("stored notes drop the null byte", stored?.notes === "Fixture passage.");

  const plain = "BT (Polling units 453 stay on the voter register.) Tj (bad\\000byte) Tj ET";
  const compressed = deflateSync(Buffer.from("BT (Section 40 establishes an adequate number of polling units.) Tj ET"));
  const pdf = Buffer.concat([
    Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 2 /Kids [3 0 R 5 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length ${plain.length} >>
stream
${plain}
endstream
endobj
5 0 obj << /Type /Page /Parent 2 0 R /Contents 6 0 R >> endobj
6 0 obj << /Filter /FlateDecode /Length ${compressed.length} >>
stream
`),
    compressed,
    Buffer.from(`
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF`),
  ]);
  const extracted = extractPdfDocument(pdf);
  const fromPdf = prepareEvidenceDraft({
    sourceId: "pdf-fixture",
    text: extracted.passage,
    pageLabel: extracted.pageLabel,
    question: questions[0],
    notes: "Read from the fixture PDF.",
  });
  check("fixture pdf keeps the polling-unit sentence", fromPdf.excerpt.includes("Polling units 453"));
  check("fixture pdf drops the null byte", !fromPdf.excerpt.includes("\u0000") && draftIsStorable(fromPdf));
  check("fixture pdf records a page", fromPdf.pageLabel === "p. 1" || fromPdf.pageLabel === "pp. 1–2");
  const again = new Map<string, typeof fromPdf>();
  again.set(fromPdf.sourceId, fromPdf);
  check("pdf passage can be read back from the fixture store", again.get("pdf-fixture")?.excerpt.includes("voter register") === true);

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("research inventory checks passed");
}

void main();
