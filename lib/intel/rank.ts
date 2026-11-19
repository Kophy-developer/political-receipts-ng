export type Importance = "high" | "medium" | "low";

export function rankClaim(input: {
  accounts: number;
  engagement: number;
  hasFigure: boolean;
  publicIssue: boolean;
  deskClass?: "actionable" | "discussion" | "noise";
}) {
  const accounts = Math.max(0, input.accounts);
  const engagement = Math.max(0, input.engagement);
  let importance: Importance = "low";
  if ((accounts >= 2 || engagement >= 80 || input.hasFigure) && input.publicIssue && (input.hasFigure || accounts >= 2 || engagement >= 40)) {
    importance = "high";
  } else if (input.publicIssue && (engagement >= 5 || input.hasFigure || accounts >= 1 || input.deskClass === "actionable")) {
    importance = "medium";
  }
  if (input.deskClass === "discussion" && input.hasFigure) importance = importance === "low" ? "medium" : importance;
  if (input.deskClass === "discussion" && !input.hasFigure && importance === "high") importance = "medium";
  if (input.deskClass === "noise") importance = "low";
  if (input.deskClass === "actionable" && input.publicIssue && importance === "low") importance = "medium";
  const label = importance === "high" ? "High" : importance === "medium" ? "Medium" : "Low";
  const accountLabel = `${accounts} account${accounts === 1 ? "" : "s"}`;
  const parts = [
    accountLabel,
    `${engagement} engagements`,
    input.hasFigure ? "a figure or checkable premise in the post" : "no figure in the claim",
    input.deskClass === "actionable"
      ? "actionable intelligence"
      : input.deskClass === "discussion"
        ? "discussion kept when it still carries a claimable angle"
        : "a configured public topic",
  ];
  return {
    importance,
    reason: `${label} because the desk counted ${parts.join(", ")}. The rank does not weigh who the claim helps.`,
  };
}
