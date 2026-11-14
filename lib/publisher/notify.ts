export function readyBanner(count: number) {
  if (count < 1) return null;
  if (count === 1) return "1 new draft is ready for approval.";
  return `${count} new drafts are ready for approval.`;
}

export function browserNotifyTitle(count: number) {
  if (count === 1) return "Political Receipts NG · draft ready";
  return `Political Receipts NG · ${count} drafts ready`;
}

export function browserNotifyBody(count: number) {
  if (count === 1) return "Open Approve to review the exact text before publishing.";
  return "Open Approve to review the waiting drafts. Nothing posts without your confirmation.";
}
