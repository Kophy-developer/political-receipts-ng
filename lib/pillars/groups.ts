export type StoredGroup = {
  slug: string;
  name: string;
  query: string;
  pillar: "politics" | "finance" | "football";
  enabled: boolean;
  lastUsedAt: string | null;
  rotation: number;
};

/** Least recently used enabled group for one pillar. A blank or oversized query is not usable. */
export function pickSearchGroup(groups: StoredGroup[], pillar: StoredGroup["pillar"]): StoredGroup | null {
  const usable = groups.filter((group) => (
    group.enabled
    && group.pillar === pillar
    && group.query.trim().length > 0
    && group.query.length <= 480
  ));
  usable.sort((left, right) => {
    if (left.lastUsedAt == null && right.lastUsedAt != null) return -1;
    if (left.lastUsedAt != null && right.lastUsedAt == null) return 1;
    if (left.lastUsedAt && right.lastUsedAt && left.lastUsedAt !== right.lastUsedAt) {
      return left.lastUsedAt < right.lastUsedAt ? -1 : 1;
    }
    if (left.rotation !== right.rotation) return left.rotation - right.rotation;
    return left.name.localeCompare(right.name);
  });
  return usable[0] ?? null;
}
