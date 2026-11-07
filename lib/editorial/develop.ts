import { createHash } from "node:crypto";
import { angleFromAnalysis, opinionAngle } from "@/lib/editorial/findings";
import { describeSource, type SourceQuality } from "@/lib/editorial/quality";
import { examineSources, type ResearchStage } from "@/lib/research/examine";
import { investigate, type Investigation } from "@/lib/research/investigate";
import { classifyEvidence, type EvidenceStatus, type FailureKind, type SearchStatus, type SourceStance } from "@/lib/research/relevance";
import type { SeriesAnalysis } from "@/lib/research/series";
import type { SeriesProvenance } from "@/lib/research/structured-cache";

export const editorialReview = "Needs editorial review" as const;

export type EvidenceLabel = "none" | "insufficient" | "usable";

export type RetrievedSource = {
  title: string;
  url: string;
  domain: string;
  snippet?: string | null;
  opened?: boolean;
  text?: string | null;
  premise?: string;
  stance?: SourceStance;
  limitation?: string;
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
  evidenceStatus: EvidenceStatus | null;
  searchStatus: SearchStatus | null;
  failureKind: FailureKind | null;
  nextAction: string | null;
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
  investigation: Investigation | null;
  analysis: SeriesAnalysis | null;
  seriesProvenance: SeriesProvenance | null;
  researchStage: ResearchStage | null;
  continuations: number;
  blocker: string | null;
  priorPlans: Array<{ hash: string | null; queries: string[] }>;
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
  draft: (input: { angle: string; points: string[]; verdict: string; postText: string; evidence: RetrievedSource[]; analysis: SeriesAnalysis | null }) => Promise<DraftResult>;
};

const voicePoint = "Write in the desk's voice: conversational, direct, and careful about what is verified. Do not endorse a candidate, attack a party, or forecast an election.";

export function sourceHash(sourceText: string) {
  return createHash("sha256").update(sourceText.replace(/\s+/g, " ").trim()).digest("hex");
}

export function labelRetrieved(sources: Array<{ domain: string; social: boolean; title?: string; snippet?: string | null; opened?: boolean; text?: string | null }>, premises: string[] = []) {
  const classified = classifyEvidence({
    premises: premises.length ? premises : ["the factual premise"],
    sources: sources.map((source) => ({
      title: source.title || source.domain,
      url: `https://${source.domain}`,
      domain: source.domain,
      snippet: source.snippet,
      opened: source.opened,
      text: source.text,
    })),
    searchCompleted: true,
  });
  return classified.label;
}

const furtherSearchNote = "Next action: editorial review. A further search is separate, up to 3 searches, and it does not reset the daily cap. It does not run until you confirm.";

export function revalidateDevelopment(state: DevelopmentState): DevelopmentState {
  const premises = state.quality.checkableFacts.length ? state.quality.checkableFacts : [state.quality.summary];
  const classified = classifyEvidence({
    premises,
    sources: state.evidence?.sources ?? [],
    searchCompleted: state.completed.includes("research"),
  });
  const required = state.quality.researchNeed === "yes";
  const ready = state.ready && (!required || classified.evidenceStatus === "EVIDENCE_READY");
  return {
    ...state,
    evidence: { label: classified.label, sources: classified.readings },
    evidenceStatus: state.completed.includes("research") ? classified.evidenceStatus : state.evidenceStatus,
    searchStatus: classified.searchStatus,
    failureKind: required && classified.evidenceStatus !== "EVIDENCE_READY" ? classified.failureKind : state.failureKind,
    ready,
  };
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
    evidenceStatus: null,
    searchStatus: null,
    failureKind: null,
    nextAction: null,
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
    investigation: null,
    analysis: null,
    seriesProvenance: null,
    researchStage: null,
    continuations: 0,
    blocker: null,
    priorPlans: [],
  };
}

export function angleFor(quality: SourceQuality, evidence: DevelopmentState["evidence"], analysis?: SeriesAnalysis | null) {
  if (analysis?.chart && analysis.comparable) return angleFromAnalysis(quality, analysis);
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
      title: "The post rejects another person's claim. No opened statistical series is on file, so this desk cannot say whether the measured flow rose or fell, or why.",
      points: ["The factual sentence still belongs to the person who said it.", "Do not say the author claimed that foreign companies are not investing.", voicePoint],
    };
  }
  if (/quotes|attributes this claim/i.test(quality.summary)) {
    return {
      title: "The claim stays with the speaker the post names. The posting account is not treated as the person who made it.",
      points: [verified ? "Mention a retrieved source only for what that source supports." : "Do not say the claim was independently verified.", voicePoint],
    };
  }
  if (quality.checkableFacts.length > 0) {
    return {
      title: "Keep the factual sentence separate from the opinion around it.",
      points: ["The opinion can stay an opinion.", verified ? "Use a retrieved source for the factual sentence, or say it is unresolved." : "Do not state the factual sentence as established.", voicePoint],
    };
  }
  if (quality.primaryKind === "opinion" && quality.researchNeed === "no") return opinionAngle();
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
    const sources = (state.evidence?.sources ?? []).filter((source) => source.opened && source.stance && source.stance !== "does_not_address");
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
      if (state.evidenceStatus !== "EVIDENCE_READY") return { ok: false as const, question: "Required research does not have an opened source that addresses the premise." };
      if (!unresolvedLanguage(text) && !cites(text, sources)) {
        return { ok: false as const, question: "A factual draft neither cites the retrieved evidence nor says what is unresolved." };
      }
    } else if (factualContextNeeded(state.quality) && state.evidence?.label !== "usable") {
      if (!/reports|the post says|the post reports/i.test(text) || !unresolvedLanguage(text)) {
        return { ok: false as const, question: "The reported event is not confirmed. The draft has to say the post reports it and that this desk has not confirmed it." };
      }
    } else if (state.quality.primaryKind === "opinion" && state.quality.researchNeed === "no" && state.quality.checkableFacts.length === 0) {
      if (!/\b(judgment|opinion)\b/i.test(text) || /\b(this is false|this is true|we verified)\b/i.test(text)) {
        return { ok: false as const, question: "An opinion draft has to stay a judgment and must not issue a factual verdict." };
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
  | { kind: "draft"; angle: string; points: string[]; verdict: string; analysis: SeriesAnalysis | null }
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
  if (required && state.evidenceStatus !== "EVIDENCE_READY") {
    const question = state.quality.checkableFacts[0] || state.quality.summary;
    const investigation = state.investigation ?? investigate(state.sourceText, state.quality);
    if (investigation.numerical && state.completed.includes("research")) {
      return { kind: "review", question: `Search completed is not a statistical series. ${question} Continue research on this story. Nothing runs until you confirm.` };
    }
    const why = state.evidenceStatus === "RELEVANT_EVIDENCE_FOUND"
      ? `A result mentions the premise, but no page was opened. It is not proof. ${question}`
      : `No saved result addresses the premise. ${question}`;
    return { kind: "review", question: `${why} ${furtherSearchNote}` };
  }
  if (!state.completed.includes("angle") || !state.angle) return { kind: "angle" };
  if (!state.completed.includes("draft")) {
    return {
      kind: "draft",
      angle: state.angle,
      points: state.anglePoints,
      analysis: state.analysis,
      verdict: state.quality.primaryKind === "prediction"
        ? "This is a prediction, not a result. Do not forecast the election."
        : state.evidenceStatus === "EVIDENCE_READY"
          ? "Opened sources address the premise. Do not announce a verdict they do not support."
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
  const investigation = investigate(state.sourceText, state.quality);
  const examined = investigation.numerical ? examineSources(investigation, result.sources) : null;
  const classified = classifyEvidence({
    premises: state.quality.checkableFacts.length ? state.quality.checkableFacts : [state.quality.summary],
    sources: examined ? examined.sources : result.sources,
    searchCompleted: true,
  });
  const evidenceStatus = examined?.stage === "EVIDENCE_READY"
    ? "EVIDENCE_READY" as const
    : examined
      ? "EVIDENCE_INSUFFICIENT" as const
      : classified.evidenceStatus;
  const readings = examined ? examined.sources : classified.readings;
  return {
    ...state,
    completed: state.completed.includes("research") ? state.completed : [...state.completed, "research"],
    investigation,
    analysis: examined?.analysis ?? null,
    researchStage: examined?.stage ?? (classified.searchStatus ? "SEARCH_COMPLETED" : null),
    evidence: { label: evidenceStatus === "EVIDENCE_READY" ? "usable" as const : readings.length ? "insufficient" as const : classified.label, sources: readings },
    evidenceStatus,
    searchStatus: classified.searchStatus,
    failureKind: evidenceStatus === "EVIDENCE_READY" ? null : examined ? "inadequate evidence" as const : classified.failureKind,
    researchFailed: false,
    error: null,
    researchCalls: state.researchCalls + (result.called ? 1 : 0),
  };
}

function withAngle(state: DevelopmentState): DevelopmentState {
  const angle = angleFor(state.quality, state.evidence, state.analysis);
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
  const checked = revalidateDevelopment(state);
  let current: DevelopmentState = { ...checked, error: checked.draftFailed || checked.researchFailed ? null : checked.error };
  for (let step = 0; step < 6; step += 1) {
    const next = nextStep(current);
    if (next.kind === "blocked") {
      return { ...current, ready: false, review: current.quality.review, error: null, unresolved: next.message };
    }
    if (next.kind === "review") {
      const continueOnStory = /Continue research on this story/.test(next.question);
      return {
        ...current,
        ready: false,
        review: editorialReview,
        unresolved: next.question,
        nextAction: continueOnStory ? "Continue research on this story. Nothing runs until you confirm." : furtherSearchNote,
        failureKind: current.failureKind ?? (current.evidenceStatus === "RELEVANT_EVIDENCE_FOUND" ? "inadequate evidence" : "source relevance"),
        error: null,
      };
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
      evidence: (current.evidence?.sources ?? []).filter((source) => source.opened && source.stance !== "does_not_address"),
      analysis: current.analysis,
    });
    current = withDraft(current, result);
    if (!result.ok) return current;
  }
  return current;
}

export function lifecycleForDevelopment(state: DevelopmentState) {
  if (state.ready) return "READY_FOR_EDITOR" as const;
  if (state.quality.researchNeed === "yes" && state.completed.includes("research") && state.evidenceStatus !== "EVIDENCE_READY") {
    return "RESEARCHING" as const;
  }
  if (state.completed.includes("draft")) return "DRAFTING" as const;
  if (state.completed.includes("angle")) return "ANGLE_READY" as const;
  if (state.evidenceStatus === "EVIDENCE_READY") return "EVIDENCE_READY" as const;
  if (state.completed.includes("research")) return "RESEARCHING" as const;
  if (state.researchFailed || state.draftFailed) return "RESEARCHING" as const;
  return "RANKED" as const;
}

export function furtherSearchPreview() {
  return {
    searches: 3,
    modelRequests: 0,
    message: "A further search can look at the next source tier. Up to 3 searches. The completed search and its usage stay. The daily cap is not reset. Nothing runs until you confirm.",
  };
}
