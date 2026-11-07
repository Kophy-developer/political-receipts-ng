import { angleFor } from "@/lib/editorial/develop";
import { composeFromAnalysis } from "@/lib/editorial/findings";
import { describeSource, type SourceQuality } from "@/lib/editorial/quality";
import { examineSources } from "@/lib/research/examine";
import { investigate } from "@/lib/research/investigate";
import type { StructuredRecord } from "@/lib/research/structured-cache";

export function prepareOfficialDevelopment(input: { sourceText: string; record: StructuredRecord; quality?: SourceQuality }) {
  const quality = input.quality ?? describeSource(input.sourceText);
  const investigation = investigate(input.sourceText, quality);
  const examined = examineSources(investigation, [{
    title: input.record.sourceName,
    url: input.record.pageUrl,
    domain: "data.worldbank.org",
    opened: true,
    text: input.record.passage,
  }]);
  const analysis = examined.analysis;
  const comparable = Boolean(analysis?.chart && analysis.comparable);
  const angle = comparable && analysis ? angleFor(quality, { label: "usable", sources: examined.sources }, analysis) : null;
  const draft = comparable && analysis
    ? composeFromAnalysis({ quality, analysis, domain: "data.worldbank.org" })
    : "";
  return {
    ready: Boolean(draft),
    draft,
    angle,
    analysis,
    investigation,
    stage: examined.stage,
    sources: examined.sources,
    provenance: input.record,
  };
}
