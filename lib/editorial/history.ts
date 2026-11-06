export type VersionedCard = {
  id: string;
  conversationId: string | null;
  source: string;
  version?: number | null;
};

/** The active card is the newest assessment for a conversation. Older versions and earlier cards for that conversation are history. */
export function splitByCurrentVersion<T extends VersionedCard>(items: T[]) {
  const latest = new Map<string, T>();
  for (const item of items) {
    if (item.source !== "assessment" || !item.conversationId) continue;
    const previous = latest.get(item.conversationId);
    if (!previous || (item.version ?? 0) > (previous.version ?? 0)) latest.set(item.conversationId, item);
  }
  const current: T[] = [];
  const history: T[] = [];
  for (const item of items) {
    const active = item.conversationId ? latest.get(item.conversationId) : undefined;
    if (active && active.id !== item.id) history.push(item);
    else current.push(item);
  }
  return { current, history };
}
