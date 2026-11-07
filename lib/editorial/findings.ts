import type { SourceQuality } from "@/lib/editorial/quality";
import type { SeriesAnalysis } from "@/lib/research/series";

function amount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function percent(value: number | null) {
  if (value === null) return "a change that was not calculated";
  const text = Number.isInteger(value) ? value.toFixed(0) : String(value);
  return `${value > 0 ? "up" : value < 0 ? "down" : "flat"} ${text.replace("-", "")} percent`;
}

export function angleFromAnalysis(quality: SourceQuality, analysis: SeriesAnalysis) {
  const rejects = /rejects another person's claim|does not assert/i.test(quality.summary);
  const span = analysis.tenYear
    ? `${analysis.series} in the opened table is ${amount(analysis.tenYear.end)} ${analysis.unit} in ${analysis.tenYear.toYear}, from ${amount(analysis.tenYear.start)} in ${analysis.tenYear.fromYear}`
    : `${analysis.series} in the opened table runs only from ${analysis.observations[0]?.year ?? "an unstated year"} to ${analysis.observations.at(-1)?.year ?? "an unstated year"}`;
  const latest = analysis.changes.at(-1);
  const turn = latest ? ` The latest one-year move, ${latest.fromYear} to ${latest.toYear}, is ${percent(latest.percent)}.` : "";
  const attribution = rejects
    ? " The post rejects another person's claim. It does not say foreign companies are not investing."
    : "";
  const fdi = /foreign direct investment/i.test(analysis.series);
  const identity = fdi
    ? " This is foreign direct investment, net inflows, in current US dollars. It is not capital importation, not portfolio investment, not an announced commitment, and not a count of companies."
    : /capital importation/i.test(analysis.series)
      ? " That series is not foreign direct investment, not a portfolio flow, and not an announcement."
      : " This series is only the measure named in the table.";
  return {
    title: `${span}.${turn}${identity} It does not show why the figures moved or that the economy is the best it has ever been.${attribution}`,
    points: [
      analysis.interpretations[0] || "The opened series is the evidence.",
      analysis.interpretations[1] || "A second reading stays beside the first.",
      "Do not treat a State House announcement as this table.",
      "Do not say the author claimed that foreign companies are not investing.",
      "Do not endorse either speaker. The table does not establish a cause.",
    ],
  };
}

export function composeFromAnalysis(input: { quality: SourceQuality; analysis: SeriesAnalysis; domain: string }) {
  const { analysis } = input;
  const latest = analysis.changes.at(-1);
  const rejects = /rejects another person's claim|does not assert/i.test(input.quality.summary);
  const lines = [
    rejects
      ? "Someone told the author that foreign companies are investing in Nigeria because of Tinubu, and that the economy is the best it has ever been. The author rejected that account. The author did not say foreign companies are not investing."
      : "The draft uses only the figures in the opened table.",
    `The opened ${analysis.sourceName} series is ${analysis.series}, in ${analysis.unit}. ${analysis.basis === "unknown" ? "The source does not say whether the figures are nominal or real." : `The source marks the figures as ${analysis.basis}.`}${/capital importation/i.test(analysis.series) ? " It is not foreign direct investment, not portfolio investment, and not an announcement." : ""}${/foreign direct investment/i.test(analysis.series) ? " It is foreign direct investment, net inflows. It is not capital importation, not portfolio investment, not an announced commitment, and not a count of companies." : ""}`,
  ];
  if (analysis.tenYear) {
    lines.push(`From ${analysis.tenYear.fromYear} to ${analysis.tenYear.toYear}, the table moves from ${amount(analysis.tenYear.start)} to ${amount(analysis.tenYear.end)}. That is an absolute change of ${amount(analysis.tenYear.absolute)}, ${percent(analysis.tenYear.percent)}.`);
  } else if (analysis.observations.length >= 2) {
    const first = analysis.observations[0];
    const last = analysis.observations[analysis.observations.length - 1];
    lines.push(`The opened years run from ${first.year} to ${last.year}. That is shorter than ten years, so no ten-year comparison is stated. Missing years were not filled in.`);
  }
  if (analysis.threeYear) {
    lines.push(`The latest three years in the table, ${analysis.threeYear.fromYear} to ${analysis.threeYear.toYear}, move from ${amount(analysis.threeYear.start)} to ${amount(analysis.threeYear.end)}, ${percent(analysis.threeYear.percent)}.`);
  }
  if (latest?.consecutive) {
    lines.push(`Year to year, ${latest.fromYear} to ${latest.toYear} changes by ${amount(latest.absolute)}, ${percent(latest.percent)}.`);
  }
  if (analysis.observations.some((item) => item.value < 0)) {
    lines.push("One year in the opened table is a negative net inflow. That figure is not a count of companies leaving, and it does not mean no company invested.");
  }
  const unpublished = analysis.limitations.find((item) => /not in the published series/.test(item));
  if (unpublished) lines.push(unpublished);
  lines.push("One reading is the direction of the longer window. Another is that the path inside it is uneven, so the latest year can disagree with the long comparison. The table does not say why the figures moved, and it does not show that the economy is historically at its best.");
  lines.push(`${input.domain} is the page on file. This is not a verdict.`);
  return lines.join(" ");
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
