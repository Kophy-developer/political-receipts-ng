export function investmentBillions(value: number, unit: string) {
  if (/million/i.test(unit)) return value / 1_000;
  if (/current us dollars|us dollar|usd/i.test(unit) || Math.abs(value) >= 100_000_000) return value / 1_000_000_000;
  return null;
}

export function formatBillions(billions: number) {
  const negative = billions < 0;
  const text = `$${Math.abs(billions).toFixed(2)}bn`;
  return negative ? `−${text}` : text;
}

export function formatInvestment(value: number, unit: string) {
  const billions = investmentBillions(value, unit);
  if (billions === null) {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)} ${unit}`;
  }
  return formatBillions(billions);
}

export function formatPercentPoint(value: number | null) {
  if (value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  const body = Number.isInteger(rounded) ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1);
  const word = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  return { rounded, body, word, signed: `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${body}%` };
}

export function chartScale(values: number[]) {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const min = Math.min(dataMin, 0);
  const max = Math.max(dataMax, 0);
  const span = max - min || 1;
  return {
    min: min < 0 ? min - span * 0.08 : min,
    max: max + span * 0.08,
    dataMin,
    dataMax,
    includesZero: true,
  };
}

export function provenanceSentence(input: { origin: string; live: boolean; sourceUpdated: string | null; retrievedAt: string | null }) {
  const updated = input.sourceUpdated ? `The source last updated ${input.sourceUpdated}.` : "The source update date was not in the file.";
  if (input.live && input.origin === "live" && input.retrievedAt) {
    return `Live World Bank response, received ${input.retrievedAt}. ${updated} This time is the stored retrieval, not a time added for the post.`;
  }
  const stored = input.retrievedAt ? ` The saved copy was stored ${input.retrievedAt}.` : " No live retrieval time is stored.";
  return `Saved official data. Not a live retrieval. ${updated}${stored}`;
}
