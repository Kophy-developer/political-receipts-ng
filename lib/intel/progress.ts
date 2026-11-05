import { providerLabels, type ProviderId } from "@/lib/ai/catalog";

export const reprocessPhases = ["preparing", "extraction", "classifying", "opportunities", "complete", "failed"] as const;

export type ReprocessPhase = (typeof reprocessPhases)[number];

export const activeReprocessPhases = ["preparing", "extraction", "classifying", "opportunities"] as const;

export const staleReprocessMs = 90_000;
export const stillWorkingAfterMs = 10_000;

export type ProgressStep = {
  provider: ProviderId;
  state: "trying" | "failed" | "succeeded";
  classification: string | null;
};

export type ReprocessJob = {
  id: string;
  scanId: string;
  requestId: string;
  phase: ReprocessPhase;
  startedAt: string;
  finishedAt: string | null;
  posts: number;
  conversations: number;
  opportunities: number;
  provider: string | null;
  steps: ProgressStep[];
};

const trail = ["Preparing saved posts", "AI extraction", "Classifying conversations", "Building opportunities", "Complete"] as const;

const phaseIndex: Record<ReprocessPhase, number> = {
  preparing: 0,
  extraction: 1,
  classifying: 2,
  opportunities: 3,
  complete: 4,
  failed: 1,
};

export function jobIsActive(job: ReprocessJob | null, now: number) {
  if (!job || !activeReprocessPhases.includes(job.phase as (typeof activeReprocessPhases)[number])) return false;
  const started = Date.parse(job.startedAt);
  return Number.isFinite(started) && now - started < staleReprocessMs;
}

export function claimDecision(job: ReprocessJob | null, now: number) {
  return jobIsActive(job, now) ? ("attach" as const) : ("start" as const);
}

export function editorFailureReason(classification: string | null) {
  if (classification === "TIMEOUT") return "Timed out";
  if (classification === "OUTPUT_TOKEN_LIMIT") return "The output budget was used up";
  if (classification === "INVALID_RESPONSE") return "The response could not be read";
  if (classification === "RATE_LIMITED" || classification === "DAILY_LIMIT_REACHED") return "Rate limited";
  if (classification === "PROVIDER_SERVER_ERROR" || classification === "NETWORK_ERROR" || classification === "MODEL_NOT_AVAILABLE_FOR_ACCOUNT") {
    return "The provider was unavailable";
  }
  if (classification === "BAD_REQUEST") return "The provider rejected the response";
  if (classification === "AUTHENTICATION_FAILED") return "The provider refused the request";
  return "The provider did not finish";
}

export function chainLines(steps: ProgressStep[]) {
  return steps.map((step) => {
    const name = providerLabels[step.provider];
    if (step.state === "trying") return `Trying ${name}...`;
    if (step.state === "succeeded") return `${name} finished`;
    return `${name} failed: ${editorFailureReason(step.classification)}`;
  });
}

export function phaseTrail(phase: ReprocessPhase) {
  const current = phaseIndex[phase];
  return trail.map((label, index) => ({
    label,
    state: index < current ? ("done" as const) : index === current ? ("current" as const) : ("waiting" as const),
  }));
}

export type DeskJobView = {
  kind: "running" | "failed" | "complete" | "ready";
  button: string | null;
  buttonDisabled: boolean;
  lines: string[];
  trail: Array<{ label: string; state: "done" | "current" | "waiting" }>;
  chain: string[];
  stillWorking: boolean;
};

export function deskJobView(input: { job: ReprocessJob | null; postsSaved: number; now: number }): DeskJobView {
  const posts = input.job?.posts || input.postsSaved;
  const chain = chainLines(input.job?.steps ?? []);
  if (input.job && jobIsActive(input.job, input.now)) {
    const started = Date.parse(input.job.startedAt);
    return {
      kind: "running",
      button: "Reprocessing...",
      buttonDisabled: true,
      lines: [
        `Reprocessing ${posts} saved posts`,
        "No new X request will be made.",
        ...(Number.isFinite(started) && input.now - started >= stillWorkingAfterMs ? ["Still working. Your saved X posts are safe."] : []),
      ],
      trail: phaseTrail(input.job.phase),
      chain,
      stillWorking: Number.isFinite(started) && input.now - started >= stillWorkingAfterMs,
    };
  }
  if (input.job?.phase === "complete") {
    const provider = input.job.provider === "groq" || input.job.provider === "openrouter" || input.job.provider === "gemini"
      ? providerLabels[input.job.provider]
      : "Not recorded";
    return {
      kind: "complete",
      button: null,
      buttonDisabled: true,
      lines: [
        "Reprocess complete",
        `${posts} posts processed`,
        `${input.job.conversations} conversations reviewed`,
        `${input.job.opportunities} ${input.job.opportunities === 1 ? "opportunity" : "opportunities"} found`,
        `AI provider: ${provider}`,
      ],
      trail: phaseTrail("complete"),
      chain,
      stillWorking: false,
    };
  }
  if (input.job?.phase === "failed") {
    return {
      kind: "failed",
      button: "Try analysis again",
      buttonDisabled: false,
      lines: [
        "AI analysis could not be completed.",
        `${posts} X posts are still safely stored.`,
        "No new X request is needed.",
      ],
      trail: [],
      chain,
      stillWorking: false,
    };
  }
  return {
    kind: "ready",
    button: "Reprocess saved posts",
    buttonDisabled: false,
    lines: [
      `${posts} posts were saved successfully.`,
      "AI analysis did not finish.",
      "X scan complete",
      `${posts} posts saved`,
      "AI analysis incomplete",
      "No additional X request is needed.",
    ],
    trail: [],
    chain: [],
    stillWorking: false,
  };
}

export function splitLatestWork<T extends { scanId: string | null }>(latestScanId: string | null, items: T[]) {
  if (!latestScanId) return { latest: [] as T[], older: items };
  return {
    latest: items.filter((item) => item.scanId === latestScanId),
    older: items.filter((item) => item.scanId !== latestScanId),
  };
}

export function scanHistoryStatus(input: { stage: string | null; status: string }) {
  if (input.stage === "COMPLETE" || input.status === "completed") return "Complete";
  if (input.stage === "AI_PROCESSING") return "In progress";
  if (input.stage === "X_RETRIEVAL_COMPLETE") return "Posts saved";
  if (input.stage === "PARTIAL_FAILURE" || input.status === "stopped") return "Analysis incomplete";
  return "Stopped";
}

export function historyProvider(input: { phase: ReprocessPhase | null; provider: string | null }) {
  if (input.phase === "failed") return "None completed";
  if (input.provider === "groq" || input.provider === "openrouter" || input.provider === "gemini") return providerLabels[input.provider];
  return "Not recorded";
}

export function noteTrying(steps: ProgressStep[], provider: ProviderId): ProgressStep[] {
  if (steps.some((step) => step.provider === provider)) return steps;
  return [...steps, { provider, state: "trying", classification: null }];
}

export function noteFinished(steps: ProgressStep[], provider: ProviderId, state: "failed" | "succeeded", classification: string | null): ProgressStep[] {
  const next = steps.some((step) => step.provider === provider) ? steps : [...steps, { provider, state: "trying" as const, classification: null }];
  return next.map((step) => (step.provider === provider ? { provider, state, classification } : step));
}
