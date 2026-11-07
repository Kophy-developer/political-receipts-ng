import { deflateSync } from "node:zlib";
import { composeFromAnalysis } from "../lib/editorial/findings";
import { describeSource } from "../lib/editorial/quality";
import { chooseDocumentIds } from "../lib/research/examine";
import { evidenceFromPdfPages, extractDocument } from "../lib/research/extract";
import { investigate } from "../lib/research/investigate";
import { readPdfPages } from "../lib/research/pdf-text";
import { attemptDocumentRead, downloadByteLimit, readBoundedBody, rejectionForDownload } from "../lib/research/read-document";
import { analyzeSeries } from "../lib/research/series";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function streamFor(lines: string[], compress = false) {
  const text = `BT ${lines.map((line) => `(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" T* ")} ET`;
  const data = compress ? deflateSync(Buffer.from(text)) : Buffer.from(text);
  const dict = compress ? `/Filter /FlateDecode /Length ${data.length}` : `/Length ${data.length}`;
  return { dict, data };
}

function pdfDocument(pages: string[][], padding = 0, compressFirst = false) {
  const kids: number[] = [];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  let next = 3;
  const bodies: Buffer[] = [];
  pages.forEach((lines) => {
    const pageId = next;
    const contentId = next + 1;
    next += 2;
    kids.push(pageId);
    const stream = streamFor(lines, compressFirst);
    bodies.push(Buffer.from(`${pageId} 0 obj << /Type /Page /Parent 2 0 R /Contents ${contentId} 0 R >> endobj\n`));
    bodies.push(Buffer.from(`${contentId} 0 obj << ${stream.dict} >> stream\n`));
    bodies.push(stream.data);
    bodies.push(Buffer.from("\nendstream endobj\n"));
  });
  if (padding > 0) {
    bodies.push(Buffer.from(`${next} 0 obj << /Length ${padding} >> stream\n`));
    bodies.push(Buffer.alloc(padding, 0x41));
    bodies.push(Buffer.from("\nendstream endobj\n"));
  }
  chunks.push(Buffer.from(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] >> endobj\n`));
  chunks.push(...bodies);
  chunks.push(Buffer.from("trailer << /Root 1 0 R >>\n%%EOF\n"));
  return new Uint8Array(Buffer.concat(chunks));
}

const url = "https://www.nigerianstat.gov.ng/pdfuploads/Capital%20importation%20Q4%202023.pdf";
const small = pdfDocument([["Capital importation USD million nominal", "2024 | 6100"]]);
const large = pdfDocument([
  ["Merchandise exports are discussed in this section of the report."],
  ["Capital importation USD million nominal", "2016 | 5000", "2017 | 6200", "2018 | 4100"],
], 1_250_000, true);
const irrelevant = pdfDocument([
  ["Merchandise exports remained a trade topic for Nigeria and the region."],
  ["The country profile lists export growth without a capital series."],
], 1_250_000);
const scanned = new TextEncoder().encode([
  "%PDF-1.4",
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
  "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
  "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
  "4 0 obj << /Filter /DCTDecode /Length 12 >> stream",
  "not readable",
  "endstream endobj",
  "trailer << /Root 1 0 R >>",
  "%%EOF",
].join("\n"));
const spanning = pdfDocument([
  ["Capital importation USD million nominal", "2016 | 5000", "2017 | 6200"],
  ["2018 | 4100", "2019 | 7300"],
]);
const gapped = pdfDocument([["Capital importation USD million nominal", "2016 | 5000", "2017 | 6200", "2020 | 2100"]]);
const mixed = pdfDocument([[
  "Capital importation USD million nominal",
  "2016 | 5000",
  "2017 | 6200",
  "Foreign direct investment percent",
  "2016 | 2.5",
  "2017 | 2.1",
]]);

async function main() {
  check("a PDF above the old gate and below the download cap is still eligible to parse", large.byteLength > 1_200_000 && large.byteLength < downloadByteLimit && rejectionForDownload(large.byteLength, "application/pdf", url) === null);
  check("an HTML file above 1200000 bytes is still rejected before parsing", rejectionForDownload(1_200_001, "text/html") === "Download too large");
  check("a download above the PDF cap is rejected before parsing", rejectionForDownload(downloadByteLimit + 1, "application/pdf", url) === "Download too large");

  const oversized = await readBoundedBody(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(40));
      controller.enqueue(new Uint8Array(40));
      controller.close();
    },
  }), 50);
  const fits = await readBoundedBody(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  }), 50);
  check("the download reader stops a stream past its byte limit", oversized.ok === false && oversized.message === "Download too large" && fits.ok && fits.bytes.length === 3);

  const opened = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: large }));
  const parsed = extractDocument({ text: opened.ok ? opened.passage : "", url, title: "Nigeria Capital Importation" });
  const analysis = analyzeSeries(parsed.observations, "capital importation");
  const draft = analysis?.chart ? composeFromAnalysis({ quality: describeSource("The post rejects another person's claim about foreign investment."), analysis, domain: "nigerianstat.gov.ng" }) : "";
  check("a large readable PDF is downloaded in the test and the relevant table is extracted", opened.ok === true && opened.passage.includes("Source URL:") && parsed.observations.map((item) => item.value).join(",") === "5000,6200,4100" && analysis?.chart?.points.length === 3 && /5,000/.test(draft) && !/8,000/.test(draft));
  check("the stored passage keeps the source page and does not keep the padding", opened.ok === true && opened.passage.includes("p. 2") && !opened.passage.includes("Merchandise exports") && opened.passage.length < 4_000);

  const repeated = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: large }));
  check("reading the same downloaded bytes again does not change the table", repeated.ok === true && repeated.passage === opened.passage);

  const smallRead = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: small }));
  const smallParsed = extractDocument({ text: smallRead.ok ? smallRead.passage : "", url, title: "Capital importation" });
  check("a small readable PDF keeps its single figure", smallRead.ok === true && smallParsed.observations.some((item) => item.year === 2024 && item.value === 6100));

  const missed = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: irrelevant }));
  check("a large PDF without the requested table stores no figures", missed.ok === false && missed.message.startsWith("No relevant table found"));

  const unreadable = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: scanned }));
  check("a scanned PDF is a parsing failure", unreadable.ok === false && unreadable.message.startsWith("Parsing failed"));

  const spread = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: spanning }));
  const spreadParsed = extractDocument({ text: spread.ok ? spread.passage : "", url, title: "Capital importation" });
  check("a table split across pages keeps every row and its page", spread.ok === true && spreadParsed.observations.map((item) => `${item.year}:${item.value}`).join(",") === "2016:5000,2017:6200,2018:4100,2019:7300" && spread.passage.includes("p. 1") && spread.passage.includes("p. 2"));

  const pages = readPdfPages(spanning, { pageLimit: 1 });
  const partial = evidenceFromPdfPages({ pages: pages.pages, url, truncated: pages.truncated });
  check("stopping at a page limit discloses the missing continuation", pages.truncated === true && partial.passage.includes("2016 | 5000") && partial.passage.includes("2017 | 6200") && !partial.passage.includes("2018 | 4100") && /Pages after 1 were not read/.test(partial.passage));

  const gapRead = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: gapped }));
  const gapAnalysis = analyzeSeries(extractDocument({ text: gapRead.ok ? gapRead.passage : "", url, title: "Capital importation" }).observations, "capital importation");
  check("missing years stay missing", gapRead.ok === true && gapAnalysis?.missingYears.join(",") === "2018,2019" && gapAnalysis.tenYear === null && gapAnalysis.observations.every((item) => item.year !== 2018 && item.year !== 2019));

  const mixedRead = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: mixed }));
  const mixedParsed = extractDocument({ text: mixedRead.ok ? mixedRead.passage : "", url, title: "Capital importation" });
  const mixedAnalysis = analyzeSeries(mixedParsed.observations, "capital importation");
  check("a percent series is not mixed into the USD table", mixedParsed.observations.some((item) => item.series === "Foreign direct investment" && item.unit === "percent" && item.value === 2.5) && mixedAnalysis?.observations.every((item) => item.unit === "USD million" && item.value >= 1000) === true && mixedAnalysis?.otherSeries.includes("Foreign direct investment") === true);

  const crowded = pdfDocument([[
    "Capital importation USD million nominal",
    ...Array.from({ length: 50 }, (_, index) => `${1990 + index} | ${index + 1}`),
    ...Array.from({ length: 50 }, (_, index) => `${1990 + index} | ${index + 101}`),
    ...Array.from({ length: 50 }, (_, index) => `${1990 + index} | ${index + 201}`),
    ...Array.from({ length: 50 }, (_, index) => `${1990 + index} | ${index + 301}`),
    ...Array.from({ length: 50 }, (_, index) => `${1990 + index} | ${index + 401}`),
    ...Array.from({ length: 50 }, (_, index) => `${1990 + index} | ${index + 501}`),
  ]]);
  const crowdedRead = await attemptDocumentRead(url, async () => ({ contentType: "application/pdf", bytes: crowded }));
  check("a table that does not fit is refused whole", crowdedRead.ok === false && crowdedRead.message.startsWith("Extracted text too large to store") && !crowdedRead.message.includes("1990 | 1"));

  const post = "just block person now now e tell me say foreign companies don Dey invest in Nigeria because of tinubu and our economy is the best it has ever been.";
  const investigation = investigate(post, describeSource(post));
  const failedPdf = {
    id: "dff429ab-4b6d-4d4a-8c63-071498ee1618",
    url,
    title: "Nigeria Capital Importation",
    domain: "nigerianstat.gov.ng",
    snippet: "In Q4 2023, total capital importation into Nigeria stood at US$1,088.48 million",
    retrievalStatus: "failed",
    rejection: "The file is too large to store an excerpt from.",
    inDomain: true,
  };
  const first = chooseDocumentIds([failedPdf], investigation, 2);
  const done = chooseDocumentIds([{ ...failedPdf, retrievalStatus: "retrieved", rejection: null }], investigation, 2);
  const hardStop = chooseDocumentIds([{ ...failedPdf, rejection: "Download too large" }], investigation, 2);
  check("the production size failure can be confirmed for one new download and is not repeated after it is stored", first[0] === failedPdf.id && done.length === 0 && hardStop.length === 0);

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("research pdf checks passed");
}

main();
