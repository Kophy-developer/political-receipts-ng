import { angleFor } from "@/lib/editorial/develop";
import { composeEditorialPosts } from "@/lib/editorial/findings";
import { validateEditorialPosts } from "@/lib/editorial/posts";
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
  const drafts = comparable && analysis ? composeEditorialPosts({ quality, analysis }) : [];
  const judged = analysis ? validateEditorialPosts(analysis, quality, drafts) : { ok: false as const, reason: "No series was opened." };
  const draft = drafts.find((item) => item.style === "conversational")?.text ?? "";
  return {
    ready: Boolean(draft) && drafts.length === 3 && judged.ok,
    draft,
    drafts,
    angle,
    analysis,
    investigation,
    stage: examined.stage,
    sources: examined.sources,
    provenance: input.record,
  };
}
