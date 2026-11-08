export const storyStates = [
  "Not started",
  "Researching",
  "Analyzing",
  "Writing",
  "Ready for You",
  "Needs attention",
] as const;

export type StoryState = (typeof storyStates)[number];

export type StoryReading = {
  state: StoryState;
  reason: string;
  action: string;
};

type Source = { opened?: boolean; stance?: string; title?: string };

export function storyReading(input: {
  lifecycle?: string | null;
  ready?: boolean;
  running?: boolean;
  researchFailed?: boolean;
  draftFailed?: boolean;
  gateFailed?: boolean;
  review?: string | null;
  error?: string | null;
  unresolved?: string | null;
  nextAction?: string | null;
  evidenceStatus?: string | null;
  searchStatus?: string | null;
  sources?: Source[];
  completed?: string[];
}): StoryReading {
  const sources = input.sources ?? [];
  const opened = sources.some((source) => source.opened === true);
  const unresolved = input.unresolved || input.error || input.review || "";
  if (input.ready || input.lifecycle === "READY_FOR_EDITOR" || input.lifecycle === "APPROVED" || input.lifecycle === "PUBLISHED") {
    return {
      state: "Ready for You",
      reason: unresolved || "A draft is waiting for you. Nothing has been published.",
      action: "Open the publish gate and confirm the exact text.",
    };
  }
  if (input.researchFailed || input.draftFailed || input.gateFailed) {
    return {
      state: "Needs attention",
      reason: unresolved || "The last step failed. Stored work was kept.",
      action: input.nextAction || "Open the story and decide the next step. Nothing runs until you confirm.",
    };
  }
  if (input.evidenceStatus === "EVIDENCE_READY" || (opened && input.evidenceStatus !== "EVIDENCE_INSUFFICIENT" && input.evidenceStatus !== "RELEVANT_EVIDENCE_FOUND")) {
    if (input.lifecycle === "DRAFTING" || input.completed?.includes("draft")) {
      return { state: "Writing", reason: unresolved || "A draft is in progress.", action: "Stay on this story. A repeat click does not start another model request." };
    }
    return {
      state: "Analyzing",
      reason: unresolved || "An opened source addresses the premise. It is not a verdict.",
      action: input.nextAction || "Develop content to continue the draft. Nothing runs until you confirm.",
    };
  }
  if (input.lifecycle === "DRAFTING") {
    return { state: "Writing", reason: unresolved || "A draft is in progress.", action: "Stay on this story. A repeat click does not start another model request." };
  }
  if (input.evidenceStatus === "RELEVANT_EVIDENCE_FOUND" || (input.searchStatus === "SEARCH_COMPLETED" && sources.length > 0 && !opened && input.evidenceStatus !== "EVIDENCE_INSUFFICIENT")) {
    return {
      state: "Researching",
      reason: unresolved || "Search results are stored. No page has been opened, so none of them is proof.",
      action: input.nextAction || "Open a saved page from this story. A new search does not start on its own.",
    };
  }
  if (input.evidenceStatus === "EVIDENCE_INSUFFICIENT" || input.review) {
    return {
      state: "Needs attention",
      reason: unresolved || "The saved results do not establish the premise.",
      action: input.nextAction || "Review the story. A further search does not start on its own.",
    };
  }
  if (input.running || (input.lifecycle === "RESEARCHING" && input.searchStatus !== "SEARCH_COMPLETED")) {
    return { state: "Researching", reason: unresolved || "Research was started and has not produced a stored result yet.", action: "Wait on this story. Do not start a second search." };
  }
  return {
    state: "Not started",
    reason: "Research has not started for this story.",
    action: "Develop content when you want a preview of the cost. Nothing runs from this screen until you confirm.",
  };
}

export function storedSources(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [] as Array<{ title: string; opened: boolean; stance: string | null }>;
  const evidence = (value as { evidence?: unknown }).evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [];
  const sources = (evidence as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as { title?: unknown; opened?: unknown; stance?: unknown };
    const title = typeof source.title === "string" && source.title.trim() ? source.title : "Untitled source";
    return [{ title, opened: source.opened === true, stance: typeof source.stance === "string" ? source.stance : null }];
  });
}

export function storyReadingFromDevelopment(value: unknown, lifecycle: string | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return storyReading({ lifecycle });
  const row = value as Record<string, unknown>;
  const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
    ? row.evidence as { sources?: unknown }
    : null;
  const sources = Array.isArray(evidence?.sources)
    ? evidence.sources.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const source = item as { opened?: unknown; stance?: unknown; title?: unknown };
        return [{ opened: source.opened === true, stance: typeof source.stance === "string" ? source.stance : undefined, title: typeof source.title === "string" ? source.title : undefined }];
      })
    : [];
  return storyReading({
    lifecycle,
    ready: row.ready === true,
    running: row.running === true,
    researchFailed: row.researchFailed === true,
    draftFailed: row.draftFailed === true,
    gateFailed: row.gateFailed === true,
    review: typeof row.review === "string" ? row.review : null,
    error: typeof row.error === "string" ? row.error : null,
    unresolved: typeof row.unresolved === "string" ? row.unresolved : null,
    nextAction: typeof row.nextAction === "string" ? row.nextAction : null,
    evidenceStatus: typeof row.evidenceStatus === "string" ? row.evidenceStatus : null,
    searchStatus: typeof row.searchStatus === "string" ? row.searchStatus : null,
    sources,
    completed: Array.isArray(row.completed) ? row.completed.filter((item): item is string => typeof item === "string") : [],
  });
}
