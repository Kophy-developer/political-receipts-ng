import type { ChecklistItem } from "@/lib/types";

export const telemetry = {
  postsMonitored: 48216,
  postsMonitoredNote: "+6.4% on the previous sample day",
  sampleDay: "3 Nov 2026",
  lastPass: "4 minutes ago",
};

export const checklist: ChecklistItem[] = [
  {
    id: "sources",
    label: "Sources verified",
    detail: "Every factual sentence traces to a source on the card.",
  },
  {
    id: "accurate",
    label: "Claim accurately represented",
    detail: "The post quotes or paraphrases the claim without widening it.",
  },
  {
    id: "accusation",
    label: "No unsupported accusation",
    detail: "No person or institution is accused beyond the cited record.",
  },
  {
    id: "opinion",
    label: "Opinion clearly distinguished from fact",
    detail: "Any judgement is marked as the desk’s reading of the evidence.",
  },
  {
    id: "quotation",
    label: "No fabricated quotation",
    detail: "Words in quotation marks appear in the original post or a cited source.",
  },
  {
    id: "statistic",
    label: "No misleading statistic",
    detail: "Numbers keep their year, unit, and denominator.",
  },
  {
    id: "conclusion",
    label: "Political conclusion supported by cited evidence",
    detail: "The last line does not outrun the evidence pack.",
  },
];

export const xCallbackPath = "/api/auth/x/callback";
