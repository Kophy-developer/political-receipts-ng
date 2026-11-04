export type Importance = "high" | "medium" | "low";

export function rankClaim(input: { accounts: number; engagement: number; hasFigure: boolean; publicIssue: boolean }) {
  const accounts = Math.max(0, input.accounts);
  const engagement = Math.max(0, input.engagement);
  let importance: Importance = "low";
  if ((accounts >= 3 || engagement >= 200) && (input.hasFigure || accounts >= 2) && input.publicIssue) {
    importance = "high";
  } else if (input.publicIssue && (engagement >= 20 || input.hasFigure || accounts >= 2)) {
    importance = "medium";
  }
  const label = importance === "high" ? "High" : importance === "medium" ? "Medium" : "Low";
  const accountLabel = `${accounts} account${accounts === 1 ? "" : "s"}`;
  const parts = [
    accountLabel,
    `${engagement} engagements`,
    input.hasFigure ? "a figure in the post" : "no figure in the claim",
    input.publicIssue ? "a configured public topic" : "no configured public topic",
  ];
  return {
    importance,
    reason: `${label} because the desk counted ${parts.join(", ")}. The rank does not weigh who the claim helps.`,
  };
}
