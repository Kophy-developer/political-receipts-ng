import type { DeskClass } from "@/lib/intel/classify";
import type { PostMetrics } from "@/lib/intel/metrics";
import type { Relevance } from "@/lib/intel/relevance";

export type { PostMetrics };

export type WorkingPost = {
  id: string;
  text: string;
  authorId: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string | null;
  metrics: PostMetrics;
  conversationId: string | null;
  referenced: Array<{ type: string; id: string }>;
  lang: string | null;
  source: string | null;
  relevance: Relevance;
  deskClass: DeskClass;
  matchedTerm: string;
  reason: string;
};
