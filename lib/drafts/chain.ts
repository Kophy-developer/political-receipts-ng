import { EDITORIAL_REJECTION, type ProviderId } from "@/lib/ai/catalog";
import { generateStructuredContent, type AttemptRecord, type ProviderCaller, type ProviderPlan } from "@/lib/ai/route";
import {
  DRAFT_UNAVAILABLE,
  draftPrompt,
  draftSchema,
  draftStyles,
  judgeModelDrafts,
  threadDecision,
  type DraftBrief,
  type DraftPiece,
  type DraftProblem,
  type GeneratedStyle,
} from "@/lib/drafts/rules";

export type StampedAttempt = AttemptRecord & {
  requestId: string;
  task: "draft" | "draft_regenerate" | "health" | "extraction" | "editorial" | "understand";
};

export type DraftChainResult = {
  requestId: string;
  outcome: "saved" | "rejected" | "unavailable";
  drafts: DraftPiece[];
  problems: DraftProblem[];
  message: string;
  provider: ProviderId | null;
  model: string | null;
  attempts: StampedAttempt[];
};

function styleObject(value: unknown) {
  return Boolean(value) && typeof value === "object";
}

/** Structural acceptance. Wording that fails the editorial rules is rejected, not retried. */
export function acceptDraftPayload(data: unknown, style?: GeneratedStyle, hashtagAlreadyUsed = false) {
  if (!data || typeof data !== "object") return "malformed" as const;
  const record = data as Record<string, unknown>;
  if (style === "thread") {
    const decision = threadDecision(record);
    if (decision.kind === "skip") return "success" as const;
  }
  if (style) {
    const present = style === "thread" ? typeof record.opening === "string" || Array.isArray(record.posts) : typeof record.text === "string";
    if (!present) return "malformed" as const;
    const wrapped = style === "thread" ? { thread: data } : { [style]: data };
    const judged = judgeModelDrafts(wrapped, hashtagAlreadyUsed);
    return judged.drafts.some((draft) => draft.style === style) ? ("success" as const) : ("rejected" as const);
  }
  const present = draftStyles.filter((item) => styleObject(record[item.id]));
  if (present.length === 0) return "malformed" as const;
  const judged = judgeModelDrafts(data, hashtagAlreadyUsed);
  if (judged.drafts.length > 0) return "success" as const;
  const onlyMissing = judged.problems.every((problem) => /did not return this style|was not a draft set/i.test(problem.reason));
  return onlyMissing ? ("malformed" as const) : ("rejected" as const);
}

export async function draftWithProviders(input: {
  requestId: string;
  task: "draft" | "draft_regenerate";
  brief: DraftBrief;
  style?: GeneratedStyle;
  hashtagAlreadyUsed?: boolean;
  plans: ProviderPlan[];
  timeoutMs: number;
  now?: () => number;
  call: ProviderCaller;
}): Promise<DraftChainResult> {
  const prompt = draftPrompt(input.brief, input.style);
  const hashtagAlreadyUsed = input.hashtagAlreadyUsed ?? false;
  const routed = await generateStructuredContent({
    task: input.task,
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    schema: draftSchema(input.style),
    evidence: input.brief.evidence,
    timeoutMs: input.timeoutMs,
    plans: input.plans,
    rejectionReason: EDITORIAL_REJECTION,
    now: input.now,
    accept: (data) => acceptDraftPayload(data, input.style, hashtagAlreadyUsed),
    call: input.call,
  });
  const attempts = routed.attempts.map((attempt) => ({ ...attempt, requestId: input.requestId, task: input.task }));
  const empty = {
    requestId: input.requestId,
    drafts: [] as DraftPiece[],
    provider: routed.provider,
    model: routed.model,
    attempts,
  };
  if (routed.rejected) {
    const wrapped = input.style ? (input.style === "thread" ? { thread: routed.data } : { [input.style]: routed.data }) : routed.data;
    const judged = judgeModelDrafts(wrapped, hashtagAlreadyUsed);
    return {
      ...empty,
      outcome: "rejected",
      problems: judged.problems,
      message: EDITORIAL_REJECTION,
    };
  }
  if (!routed.ok || routed.data === undefined) {
    return { ...empty, outcome: "unavailable", problems: [], message: DRAFT_UNAVAILABLE };
  }
  const wrapped = input.style ? (input.style === "thread" ? { thread: routed.data } : { [input.style]: routed.data }) : routed.data;
  const judged = judgeModelDrafts(wrapped, hashtagAlreadyUsed);
  const drafts = input.style ? judged.drafts.filter((draft) => draft.style === input.style) : judged.drafts;
  if (drafts.length === 0) {
    const note = judged.problems.find((item) => item.reason.startsWith("THREAD_NOT_NEEDED"));
    const onlyThatChoice = judged.problems.every((item) => item.reason.startsWith("THREAD_NOT_NEEDED"));
    if (note && onlyThatChoice) {
      return { ...empty, outcome: "saved", problems: judged.problems, message: `${note.reason} Nothing was published.` };
    }
    return { ...empty, outcome: "rejected", problems: judged.problems, message: EDITORIAL_REJECTION };
  }
  const notes = judged.problems.map((item) => (item.reason.startsWith("THREAD_NOT_NEEDED") ? item.reason : `${item.style}: ${item.reason}`));
  const missing = notes.length ? ` ${notes.join(" ")}` : "";
  const message = input.style
    ? `${drafts[0]?.label ?? "The style"} was regenerated. Nothing was published.`
    : `Drafts are saved on the claim.${missing} Nothing was published.`;
  return {
    ...empty,
    outcome: "saved",
    drafts,
    problems: input.style ? [] : judged.problems,
    message,
  };
}
