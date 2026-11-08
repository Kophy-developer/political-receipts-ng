import type { SourceQuality } from "@/lib/editorial/quality";
import { composeEditorialPosts, composeFromAnalysis, seriesInsight } from "@/lib/editorial/posts";
import type { SeriesAnalysis } from "@/lib/research/series";

export { composeEditorialPosts, composeFromAnalysis };

export function angleFromAnalysis(quality: SourceQuality, analysis: SeriesAnalysis) {
  const rejects = /rejects another person's claim|does not assert/i.test(quality.summary);
  const fdi = /foreign direct investment/i.test(analysis.series);
  const identity = fdi
    ? "Foreign direct investment, net inflows, is not capital importation, portfolio investment, an announcement, or a count of companies."
    : /capital importation/i.test(analysis.series)
      ? "Capital importation is not foreign direct investment, a portfolio flow, or an announcement."
      : "This series is only the measure named in the table.";
  return {
    title: `${seriesInsight(analysis)} ${identity}`,
    points: [
      analysis.interpretations[0] || "The opened series is the evidence.",
      analysis.interpretations[1] || "A second reading stays beside the first.",
      rejects ? "The post rejects another person's claim. Do not say the author claimed that foreign companies are not investing." : "Keep the claim with the person who made it.",
      "The table does not establish a cause, and it is not a verdict on the whole economy.",
    ],
  };
}

export function opinionAngle() {
  return {
    title: "The post is a judgment. A useful response can name the disagreement without scoring the opinion true or false.",
    points: [
      "Do not call a subjective judgment false because it has no statistic.",
      "Do not invent the account's political position.",
      "Separate the person's view from any factual premise, if one appears.",
    ],
  };
}

export function composeOpinion(summary: string) {
  return `${summary || "The post is a person's judgment."} This desk is not scoring that judgment as true or false. A factual premise, if the post had one, would need its own record. The opinion itself stays an opinion.`;
}
