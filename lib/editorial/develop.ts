import { createHash } from "node:crypto";
import { describeSource, type SourceQuality } from "@/lib/editorial/quality";

export const editorialReview = "Needs editorial review" as const;

export type EvidenceLabel = "none" | "insufficient" | "usable";

export type RetrievedSource = {
  title: string;
  url: string;
  domain: string;
};

export type DevelopmentDraft = {
  style: string;
  text: string;
  sourceHash: string;
};

export type DevelopmentState = {
  sourceHash: string;
  sourceText: string;
  quality: SourceQuality;
  completed: Array<"interpret" | "research" | "angle" | "draft">;
  evidence: { label: EvidenceLabel; sources: RetrievedSource[] } | null;
  angle: string | null;
  anglePoints: string[];
  drafts: DevelopmentDraft[];
  unresolved: string | null;
  review: typeof editorialReview | null;
  error: string | null;
  researchCalls: number;
  modelCalls: number;
  published: boolean;
  researchFailed: boolean;
  draftFailed: boolean;
  gateFailed: boolean;
  ready: boolean;
  running: boolean;
};

export type DevelopmentPreview = {
  blocked: boolean;
  message: string;
  review: typeof editorialReview | null;
  researchSearches: number;
  modelRequests: number;
  summary: string;
  premises: string[];
  researchNeed: SourceQuality["researchNeed"];
  primaryKind: SourceQuality["primaryKind"];
};

type ResearchResult = {
  ok: boolean;
  called: boolean;
  label: EvidenceLabel;
  sources: RetrievedSource[];
  message: string;
};

type DraftResult = {
  ok: boolean;
  called: boolean;
  drafts: Array<{ style: string; text: string }>;
  message: string;
};

export type DevelopmentPorts = {
  research: (input: { premises: string[]; context: string }) => Promise<ResearchResult>;
  draft: (input: { angle: string; points: string[]; verdict: string; postText: string; evidence: RetrievedSource[] }) => Promise<DraftResult>;
};

const voicePoint = "Write in the desk's voice: conversational, direct, and careful about what is verified. Do not endorse a candidate, attack a party, or forecast an election.";

export function sourceHash(sourceText: string) {
  return createHash("sha256").update(sourceText.replace(/\s+/g, " ").trim()).digest("hex");
}

export function labelRetrieved(sources: Array<{ domain: string; social: boolean }>): EvidenceLabel {
  if (sources.length === 0) return "none";
  if (sources.some((source) => source.domain && !source.social)) return "usable";
  return "insufficient";
}

export function factualContextNeeded(quality: SourceQuality) {
  return quality.researchNeed === "recommended" && (quality.primaryKind === "event" || quality.checkableFacts.length > 0);
}

export function developmentPreview(sourceText: string, limits: { maxSearches: number } = { maxSearches: 3 }): DevelopmentPreview {
  const quality = describeSource(sourceText);
  const empty = {
    quality,
    blocked: true,
    review: null as typeof editorialReview | null,
    researchSearches: 0,
    modelRequests: 0,
    summary: quality.summary,
    premises: quality.checkableFacts,
    researchNeed: quality.researchNeed,
    primaryKind: quality.primaryKind,
  };
  if (!sourceText.trim()) {
    return { ...empty, message: "The stored source text is missing. Nothing was called." };
  }
  if (!quality.matched || quality.review) {
    return {
      ...empty,
      review: editorialReview,
      message: `${editorialReview}. Attribution is ambiguous, so automated factual drafting is blocked. Research searches: 0. New model requests: 0.`,
    };
  }
  if (quality.lowValue) {
    return { ...empty, message: "This is rhetoric. It stays available and is not sent to research or drafting. Research searches: 0. New model requests: 0." };
  }
  const searches = Math.min(limits.maxSearches, Math.max(1, quality.checkableFacts.length || 1));
  if (quality.researchNeed === "yes") {
    return {
      ...empty,
      blocked: false,
      researchSearches: searches,
      modelRequests: 1,
      message: `Research is required. Up to ${searches} research searches, then 1 model request only if the evidence can support a draft. If it cannot, this is marked ${editorialReview} and no draft is requested. Nothing runs until you confirm.`,
    };
  }
  if (factualContextNeeded(quality)) {
    return {
      ...empty,
      blocked: false,
      researchSearches: searches,
      modelRequests: 1,
      message: `The post reports something a reader could check, so recommended research is not deferred. Up to ${searches} research searches, then 1 model request. Nothing runs until you confirm.`,
    };
  }
  if (quality.researchNeed === "recommended") {
    return {
      ...empty,
      blocked: false,
      modelRequests: 1,
      message: "Optional research is deferred. Research searches: 0. New model requests: 1. The draft will use the source post and will not claim it was independently verified. Nothing runs until you confirm.",
    };
  }
  if (quality.primaryKind === "prediction") {
    return {
      ...empty,
      blocked: false,
      modelRequests: 1,
      message: "This is speculation. Research searches: 0. New model requests: 1. The draft must not forecast a result. Nothing runs until you confirm.",
    };
  }
  return {
    ...empty,
    blocked: false,
    modelRequests: 1,
    message: "Research is not required. Research searches: 0. New model requests: 1. The draft will not treat the post as independently verified. Nothing runs until you confirm.",
  };
}

export function initialDevelopment(sourceText: string): DevelopmentState {
  const quality = describeSource(sourceText);
  return {
    sourceHash: sourceHash(sourceText),
    sourceText,
    quality,
    completed: ["interpret"],
    evidence: null,
    angle: null,
    anglePoints: [],
    drafts: [],
    unresolved: null,
    review: quality.review,
    error: null,
    researchCalls: 0,
    modelCalls: 0,
    published: false,
    researchFailed: false,
    draftFailed: false,
    gateFailed: false,
    ready: false,
    running: false,
  };
}

export function angleFor(quality: SourceQuality, evidence: DevelopmentState["evidence"]) {
  const verified = evidence?.label === "usable";
  if (quality.primaryKind === "prediction") {
    return {
      title: "Treat the election line as speculation. Do not forecast a winner or say who survives.",
      points: ["The post is predicting, not reporting a result.", "Say that this desk does not forecast the election.", voicePoint],
    };
  }
  if (quality.primaryKind === "event") {
    return {
      title: "Describe the reported visit, and keep the praise as the author's commentary.",
      points: [
        verified ? "A retrieved source may be mentioned. Do not turn it into a verdict." : "The desk has not confirmed the visit. Say that plainly.",
        "Do not reduce the post to the praise.",
        voicePoint,
      ],
    };
  }
  if (/rejects another person's claim|does not assert/i.test(quality.summary)) {
    return {
      title: "Keep the rejected claim with the person who made it. Do not treat the author as asserting it.",
      points: ["The factual sentence still needs a record.", "Do not settle both sides of the argument.", voicePoint],
    };
  }
  if (/quotes|attributes this claim/i.test(quality.summary)) {
    return {
      title: "Keep the claim with the speaker the post names. Do not move it onto the posting account.",
      points: [verified ? "Mention a retrieved source only for what that source supports." : "Do not say the claim was independently verified.", voicePoint],
    };
  }
  if (quality.checkableFacts.length > 0) {
    return {
      title: "Keep the factual sentence separate from the opinion around it.",
      points: ["The opinion can stay an opinion.", verified ? "Use a retrieved source for the factual sentence, or say it is unresolved." : "Do not state the factual sentence as established.", voicePoint],
    };
  }
  return {
    title: "Respond to the judgment in the post without adding a factual finding.",
    points: ["Do not invent a record.", "Say that the post was not independently verified.", voicePoint],
  };
}

function unresolvedLanguage(text: string) {
  return /not been confirmed|has not confirmed|not confirmed|not established|not independently verified|unresolved|not a result|speculation|does not forecast/i.test(text);
}

function cites(text: string, sources: RetrievedSource[]) {
  const plain = text.toLowerCase();
  return sources.some((source) => {
    const title = source.title.toLowerCase().slice(0, 24);
    return (title.length > 3 && plain.includes(title)) || (source.domain.length > 3 && plain.includes(source.domain.toLowerCase()));
  });
}

export function judgeDevelopmentDrafts(state: DevelopmentState, drafts: Array<{ text: string }>) {
  if (drafts.length === 0) return { ok: false as const, question: "No draft was saved." };
  const sources = state.evidence?.sources ?? [];
  for (const draft of drafts) {
    const text = draft.text;
    if (/https?:\/\//i.test(text)) return { ok: false as const, question: "A draft contains a link. Sources stay on the card, and the draft was not moved to Ready for You." };
    if (/\b(i endorse|we endorse|vote for)\b/i.test(text)) return { ok: false as const, question: "A draft endorses a side. It was not moved to Ready for You." };
    if (/\b(we verified|we confirmed|this is false|this is true|the record proves)\b/i.test(text)) {
      return { ok: false as const, question: "A draft states a verdict this desk has not accepted." };
    }
    if (state.quality.primaryKind === "prediction") {
      const framed = /not a result|speculation|not a forecast|does not forecast/i.test(text);
      if (!framed) return { ok: false as const, question: "The draft treats a prediction as a result. It needs to say this is speculation." };
    } else if (state.quality.researchNeed === "yes") {
      if (state.evidence?.label !== "usable") return { ok: false as const, question: "Required research did not produce usable evidence." };
      if (!unresolvedLanguage(text) && !cites(text, sources)) {
        return { ok: false as const, question: "A factual draft neither cites the retrieved evidence nor says what is unresolved." };
      }
    } else if (factualContextNeeded(state.quality) && state.evidence?.label !== "usable") {
      if (!/reports|the post says|the post reports/i.test(text) || !unresolvedLanguage(text)) {
        return { ok: false as const, question: "The reported event is not confirmed. The draft has to say the post reports it and that this desk has not confirmed it." };
      }
    } else if (!unresolvedLanguage(text) && !cites(text, sources)) {
      return { ok: false as const, question: "The draft implies a finding. It has to say the post was not independently verified, or cite a retrieved source." };
    }
  }
  const unresolved = state.quality.researchNeed === "no"
    ? "The source post was not independently verified."
    : state.evidence?.label === "usable"
      ? "Retrieved sources are filed. They are not a verdict."
      : "The desk has not confirmed the reported event.";
  return { ok: true as const, unresolved };
}

export type DevelopmentStep =
  | { kind: "blocked"; message: string }
  | { kind: "review"; question: string }
  | { kind: "research"; premises: string[]; context: string }
  | { kind: "angle" }
  | { kind: "draft"; angle: string; points: string[]; verdict: string }
  | { kind: "ready" };

export function nextStep(state: DevelopmentState): DevelopmentStep {
  if (state.published) return { kind: "blocked", message: "A published story stays published. It was not developed again." };
  if (state.ready) return { kind: "ready" };
  if (state.gateFailed) return { kind: "review", question: state.unresolved || `${editorialReview}. The draft could not be presented responsibly.` };
  if (!state.quality.matched || state.quality.review) {
    return { kind: "blocked", message: `${editorialReview}. Attribution is ambiguous, so automated factual drafting is blocked.` };
  }
  if (state.quality.lowValue) return { kind: "blocked", message: "This is rhetoric. It is not sent to research or drafting." };
  const required = state.quality.researchNeed === "yes";
  const recommended = factualContextNeeded(state.quality);
  if ((required || recommended) && !state.completed.includes("research")) {
    return {
      kind: "research",
      premises: state.quality.checkableFacts,
      context: state.quality.summary,
    };
  }
  if (required && state.evidence?.label !== "usable") {
    const question = state.quality.checkableFacts[0] || state.quality.summary;
    return { kind: "review", question: `Usable evidence was not retrieved for: ${question}` };
  }
  if (!state.completed.includes("angle") || !state.angle) return { kind: "angle" };
  if (!state.completed.includes("draft")) {
    return {
      kind: "draft",
      angle: state.angle,
      points: state.anglePoints,
      verdict: state.quality.primaryKind === "prediction"
        ? "This is a prediction, not a result. Do not forecast the election."
        : state.evidence?.label === "usable"
          ? "Retrieved sources are context. Do not announce a verdict."
          : "The source was not independently verified.",
    };
  }
  return { kind: "ready" };
}

function withResearch(state: DevelopmentState, result: ResearchResult): DevelopmentState {
  if (!result.ok) {
    return {
      ...state,
      researchFailed: true,
      error: result.message,
      researchCalls: state.researchCalls + (result.called ? 1 : 0),
    };
  }
  return {
    ...state,
    completed: state.completed.includes("research") ? state.completed : [...state.completed, "research"],
    evidence: { label: result.label, sources: result.sources },
    researchFailed: false,
    error: null,
    researchCalls: state.researchCalls + (result.called ? 1 : 0),
  };
}

function withAngle(state: DevelopmentState): DevelopmentState {
  const angle = angleFor(state.quality, state.evidence);
  return {
    ...state,
    angle: angle.title,
    anglePoints: angle.points,
    completed: state.completed.includes("angle") ? state.completed : [...state.completed, "angle"],
  };
}

function withDraft(state: DevelopmentState, result: DraftResult): DevelopmentState {
  const modelCalls = state.modelCalls + (result.called ? 1 : 0);
  if (!result.ok) {
    return { ...state, draftFailed: true, error: result.message, modelCalls };
  }
  const drafts = result.drafts.map((draft) => ({ ...draft, sourceHash: state.sourceHash }));
  const judged = judgeDevelopmentDrafts(state, drafts);
  if (!judged.ok) {
    return {
      ...state,
      drafts,
      gateFailed: true,
      ready: false,
      review: editorialReview,
      unresolved: judged.question,
      draftFailed: false,
      error: null,
      modelCalls,
    };
  }
  return {
    ...state,
    drafts,
    completed: state.completed.includes("draft") ? state.completed : [...state.completed, "draft"],
    gateFailed: false,
    ready: true,
    review: null,
    unresolved: judged.unresolved,
    draftFailed: false,
    error: null,
    modelCalls,
  };
}

export async function advanceDevelopment(state: DevelopmentState, ports: DevelopmentPorts) {
  let current: DevelopmentState = { ...state, error: state.draftFailed || state.researchFailed ? null : state.error };
  for (let step = 0; step < 6; step += 1) {
    const next = nextStep(current);
    if (next.kind === "blocked") {
      return { ...current, ready: false, review: current.quality.review, error: null, unresolved: next.message };
    }
    if (next.kind === "review") {
      return { ...current, ready: false, review: editorialReview, unresolved: next.question, error: null };
    }
    if (next.kind === "ready") return { ...current, ready: true, review: null };
    if (next.kind === "research") {
      const result = await ports.research({ premises: next.premises, context: next.context });
      current = withResearch(current, result);
      if (!result.ok) return current;
      continue;
    }
    if (next.kind === "angle") {
      current = withAngle(current);
      continue;
    }
    const result = await ports.draft({
      angle: next.angle,
      points: next.points,
      verdict: next.verdict,
      postText: current.sourceText,
      evidence: current.evidence?.sources ?? [],
    });
    current = withDraft(current, result);
    if (!result.ok) return current;
  }
  return current;
}

export function lifecycleForDevelopment(state: DevelopmentState) {
  if (state.ready) return "READY_FOR_EDITOR" as const;
  if (state.completed.includes("draft")) return "DRAFTING" as const;
  if (state.completed.includes("angle")) return "ANGLE_READY" as const;
  if (state.completed.includes("research")) return "EVIDENCE_READY" as const;
  if (state.researchFailed || state.draftFailed) return "RESEARCHING" as const;
  return "RANKED" as const;
}
