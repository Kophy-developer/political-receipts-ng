import { formatInvestment, formatPercentPoint } from "@/lib/editorial/money";
import type { Observation } from "@/lib/research/extract";

export type Change = {
  fromYear: number;
  toYear: number;
  start: number;
  end: number;
  absolute: number;
  percent: number | null;
  consecutive: boolean;
};

export type ChartSpec = {
  metric: string;
  unit: string;
  period: string;
  source: string;
  url: string;
  limitations: string[];
  points: Array<{ year: number; value: number }>;
};

export type SeriesAnalysis = {
  series: string;
  unit: string;
  basis: string;
  sourceName: string;
  url: string;
  observations: Observation[];
  otherSeries: string[];
  missingYears: number[];
  changes: Change[];
  tenYear: Change | null;
  threeYear: Change | null;
  interpretations: string[];
  limitations: string[];
  chart: ChartSpec | null;
  comparable: boolean;
};

export function percentChange(start: number, end: number) {
  if (start === 0) return null;
  return Math.round(((end - start) / start) * 1000) / 10;
}

function changeBetween(start: Observation, end: Observation, consecutive: boolean): Change {
  return {
    fromYear: start.year,
    toYear: end.year,
    start: start.value,
    end: end.value,
    absolute: Math.round((end.value - start.value) * 1000) / 1000,
    percent: percentChange(start.value, end.value),
    consecutive,
  };
}

function sameMeasure(items: Observation[]) {
  const unit = items[0]?.unit ?? "unspecified";
  const basis = items[0]?.basis ?? "unknown";
  return items.every((item) => item.unit === unit && item.basis === basis);
}

export function analyzeSeries(observations: Observation[], focus?: string | null): SeriesAnalysis | null {
  if (!observations.length) return null;
  const names = [...new Set(observations.map((item) => item.series))];
  const wanted = focus
    ? names.find((name) => name.toLowerCase().includes(focus.toLowerCase())) ?? null
    : names.length === 1 ? names[0] : null;
  const primaryName = wanted ?? names[0];
  const primary = observations.filter((item) => item.series === primaryName).sort((left, right) => left.year - right.year);
  const otherSeries = names.filter((name) => name !== primaryName);
  const comparable = sameMeasure(primary);
  const limitations: string[] = [];
  if (names.length > 1) {
    limitations.push(`${otherSeries.join("; ")} is kept separate from ${primaryName}. Those series are not treated as the same measurement.`);
  }
  if (!sameMeasure(primary)) {
    limitations.push("The observations do not share a unit or a nominal/real basis, so they were not compared.");
  }
  const uniqueYears = new Map<number, Observation>();
  const conflicts = new Set<number>();
  for (const item of primary) {
    if (conflicts.has(item.year)) continue;
    const existing = uniqueYears.get(item.year);
    if (existing && existing.value !== item.value) {
      uniqueYears.delete(item.year);
      conflicts.add(item.year);
      continue;
    }
    uniqueYears.set(item.year, item);
  }
  if (conflicts.size) {
    limitations.push(`The same year is stored twice with different values (${[...conflicts].join(", ")}), so neither value was selected.`);
  }
  const points = [...uniqueYears.values()].sort((left, right) => left.year - right.year);
  const missingYears: number[] = [];
  if (points.length >= 2) {
    for (let year = points[0].year; year <= points[points.length - 1].year; year += 1) {
      if (!uniqueYears.has(year)) missingYears.push(year);
    }
  }
  if (missingYears.length) {
    limitations.push(`The opened series has no observation for ${missingYears.join(", ")}. Those years were not filled in.`);
  }
  const changes: Change[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.year - previous.year === 1) changes.push(changeBetween(previous, current, true));
    else limitations.push(`${previous.year} and ${current.year} are not consecutive, so no one-year change was calculated across the gap.`);
  }
  const spansTenYears = points.length >= 2 && points[points.length - 1].year - points[0].year >= 9;
  const tenYear = spansTenYears && missingYears.length === 0 && sameMeasure(primary)
    ? changeBetween(points[0], points[points.length - 1], false)
    : null;
  if (!tenYear && points.length >= 2) {
    limitations.push(spansTenYears
      ? "The dates span about ten years, but missing years were not filled in, so no ten-year comparison is stated."
      : `The opened series runs from ${points[0].year} to ${points[points.length - 1].year}, which is shorter than ten years.`);
  }
  const last = points[points.length - 1];
  const recent = last ? points.filter((item) => item.year >= last.year - 2 && item.year <= last.year) : [];
  const recentMissing = last ? [last.year - 2, last.year - 1, last.year].filter((year) => !uniqueYears.has(year)) : [];
  const threeYear = recent.length >= 2 && recentMissing.length === 0 && sameMeasure(primary)
    ? changeBetween(recent[0], recent[recent.length - 1], recent[recent.length - 1].year - recent[0].year === recent.length - 1)
    : null;
  if (!threeYear && last) {
    limitations.push(recentMissing.length
      ? `The latest three-year window is missing ${recentMissing.join(", ")}, so that comparison was not forced.`
      : "The opened series does not have three years at the end of the table.");
  }
  limitations.push("A change in the series does not establish why it changed.");
  limitations.push("No opened series shows that the economy is historically at its best. That claim is broader than this table.");
  if (points.some((item) => item.basis === "unknown")) limitations.push("The document does not say whether the figures are nominal or real.");
  const sourceName = points[0]?.sourceName || "Not named in the document";
  const unit = points[0]?.unit || "unspecified";
  const basis = points[0]?.basis || "unknown";
  const url = points.find((item) => item.url)?.url || "";
  const interpretations = interpretationsFor({ series: primaryName, unit, tenYear, threeYear, changes, missingYears });
  const chart = comparable && points.length >= 2 && (names.length === 1 || Boolean(wanted))
    ? {
        metric: primaryName,
        unit,
        period: `${points[0].year}–${points[points.length - 1].year}`,
        source: sourceName,
        url,
        limitations,
        points: points.map((item) => ({ year: item.year, value: item.value })),
      }
    : null;
  return {
    series: primaryName,
    unit,
    basis,
    sourceName,
    url,
    observations: points,
    otherSeries,
    missingYears,
    changes,
    tenYear,
    threeYear,
    interpretations,
    limitations,
    chart,
    comparable: comparable && sameMeasure(primary),
  };
}

function formatNumber(value: number, unit: string) {
  return formatInvestment(value, unit);
}

function formatPercent(value: number | null) {
  const point = formatPercentPoint(value);
  if (!point) return "not calculated because the starting value is zero";
  return `${point.word} ${point.body} percent`;
}

function interpretationsFor(input: { series: string; unit: string; tenYear: Change | null; threeYear: Change | null; changes: Change[]; missingYears: number[] }) {
  const lines: string[] = [];
  const amount = (value: number) => formatNumber(value, input.unit);
  if (input.tenYear) {
    lines.push(`${input.series} is ${amount(input.tenYear.end)} in ${input.tenYear.toYear}, compared with ${amount(input.tenYear.start)} in ${input.tenYear.fromYear}. That is ${formatPercent(input.tenYear.percent)} over the opened span.`);
  } else if (input.missingYears.length) {
    lines.push("Missing years were left blank, so no ten-year comparison is stated.");
  } else {
    lines.push("The opened table does not cover about ten years, so no ten-year comparison is stated.");
  }
  if (input.threeYear) {
    lines.push(`The latest three stored years move from ${amount(input.threeYear.start)} in ${input.threeYear.fromYear} to ${amount(input.threeYear.end)} in ${input.threeYear.toYear}, ${formatPercent(input.threeYear.percent)}.`);
  }
  const latest = input.changes[input.changes.length - 1];
  if (latest) {
    lines.push(`The latest one-year change, ${latest.fromYear} to ${latest.toYear}, is ${amount(latest.absolute)} (${formatPercent(latest.percent)}).`);
  }
  if (input.tenYear && input.threeYear && input.tenYear.percent !== null && input.threeYear.percent !== null && Math.sign(input.tenYear.percent) !== Math.sign(input.threeYear.percent)) {
    lines.push("The longer window and the latest three years do not move in the same direction. Both readings stay visible.");
  } else {
    lines.push("A second reading is that one table cannot say whether a different investment measure moved the same way.");
  }
  return lines;
}

export function reviveAnalysis(value: unknown): SeriesAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<SeriesAnalysis>;
  if (typeof row.series !== "string" || !Array.isArray(row.observations)) return null;
  const observations = row.observations.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const point = item as Partial<Observation>;
    if (typeof point.series !== "string" || typeof point.year !== "number" || typeof point.value !== "number") return [];
    return [{
      series: point.series,
      year: point.year,
      value: point.value,
      unit: typeof point.unit === "string" ? point.unit : "unspecified",
      basis: point.basis === "nominal" || point.basis === "real" ? point.basis : "unknown" as const,
      sourceName: typeof point.sourceName === "string" ? point.sourceName : "Not named in the document",
      url: typeof point.url === "string" ? point.url : "",
    }];
  });
  return analyzeSeries(observations, row.series);
}
