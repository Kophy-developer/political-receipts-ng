export const POST_LIMIT = 280;

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 2 : 1,
  }).format(value);
}

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function characterCount(text: string) {
  return Array.from(text).length;
}

export function deskId(id: string) {
  return id.toUpperCase();
}

export function growthLabel(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}
