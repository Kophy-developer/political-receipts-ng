export type Attention = "Emerging" | "Growing" | "High attention";

export function attentionOf(input: { engagement: number; accounts: number }) {
  const accounts = Math.max(0, input.accounts);
  const engagement = Math.max(0, input.engagement);
  let label: Attention = "Emerging";
  if (engagement >= 200 || accounts >= 6) label = "High attention";
  else if (engagement >= 25 || accounts >= 3) label = "Growing";
  return {
    label,
    note: `${label}. One retrieval is on file, so growth is not calculated.`,
  };
}
