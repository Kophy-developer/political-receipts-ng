export type ReadyDraft = {
  style: string;
  text: string;
  sourceHash: string | null;
};

export type ReadyItem = {
  id: string;
  claimId: string;
  pillar: "politics" | "finance" | "manchester_united";
  claim: string;
  why: string;
  caveats: string[];
  sourceUrl: string | null;
  chartUrl: string | null;
  drafts: ReadyDraft[];
  readyAt: string | null;
};

export type QueueNotice = {
  count: number;
  message: string;
};
