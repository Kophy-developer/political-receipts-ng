export type DeskCard = {
  id: string;
  conversationId: string | null;
  scanId: string | null;
  rank: number | null;
  lifecycle: string;
  discoveredAt: string | null;
  title: string;
};

export type NumberedCard<T> = T & { displayNumber: number };

/** Display numbers are 1..n inside one scan. Stored queue_rank is not rewritten. */
export function numberWithinScan<T extends { id: string; rank: number | null; discoveredAt: string | null }>(cards: T[]): NumberedCard<T>[] {
  const ordered = cards.slice().sort((left, right) => {
    const leftRank = left.rank ?? 9999;
    const rightRank = right.rank ?? 9999;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const byTime = (left.discoveredAt ?? "").localeCompare(right.discoveredAt ?? "");
    if (byTime !== 0) return byTime;
    return left.id.localeCompare(right.id);
  });
  return ordered.map((card, index) => ({ ...card, displayNumber: index + 1 }));
}

const working = new Set(["RESEARCHING", "EVIDENCE_READY", "ANGLE_READY", "DRAFTING"]);
const ready = new Set(["READY_FOR_EDITOR", "APPROVED"]);

export function arrangeDesk<T extends DeskCard>(cards: T[], latestScanId: string | null) {
  const thisScan: T[] = [];
  const workingCards: T[] = [];
  const readyCards: T[] = [];
  const earlier: T[] = [];
  const passed: T[] = [];
  for (const card of cards) {
    if (card.lifecycle === "PASSED") {
      passed.push(card);
      continue;
    }
    if (ready.has(card.lifecycle)) {
      readyCards.push(card);
      continue;
    }
    if (working.has(card.lifecycle)) {
      workingCards.push(card);
      continue;
    }
    if ((card.lifecycle === "RANKED" || card.lifecycle === "ASSESSED") && latestScanId && card.scanId === latestScanId) {
      thisScan.push(card);
      continue;
    }
    earlier.push(card);
  }
  return {
    thisScan: numberWithinScan(thisScan),
    working: workingCards,
    ready: readyCards,
    earlier,
    passed,
  };
}

export function applyPass<T extends { id: string }>(cards: T[], id: string) {
  return cards.filter((card) => card.id !== id);
}

export function restoreCard<T extends { id: string }>(cards: T[], card: T, index: number) {
  if (cards.some((item) => item.id === card.id)) return cards;
  const next = cards.slice();
  next.splice(Math.max(0, Math.min(index, next.length)), 0, card);
  return next;
}
