import {
  DRAFT_UNAVAILABLE,
  draftPrompt,
  draftSchema,
  judgeModelDrafts,
  type DraftBrief,
  type DraftPiece,
  type DraftProblem,
  type GeneratedStyle,
} from "@/lib/drafts/rules";

export type DraftModelResult = {
  ok: boolean;
  called: boolean;
  data?: unknown;
  message?: string;
};

export type DraftModel = (input: { system: string; user: string; schema: unknown; promptVersion: string }) => Promise<DraftModelResult>;

export type DraftRequestResult = {
  unavailable: boolean;
  called: boolean;
  drafts: DraftPiece[];
  problems: DraftProblem[];
  message: string;
};

function unavailable(called: boolean): DraftRequestResult {
  return { unavailable: true, called, drafts: [], problems: [], message: DRAFT_UNAVAILABLE };
}

export async function requestDraftSet(input: { allowance: number; brief: DraftBrief; model: DraftModel }): Promise<DraftRequestResult> {
  if (input.allowance < 1) return unavailable(false);
  const prompt = draftPrompt(input.brief);
  let result: DraftModelResult;
  try {
    result = await input.model({ ...prompt, schema: draftSchema() });
  } catch {
    return unavailable(true);
  }
  if (!result.called || !result.ok) return unavailable(Boolean(result.called));
  const judged = judgeModelDrafts(result.data);
  if (judged.drafts.length === 0) {
    return {
      unavailable: false,
      called: true,
      drafts: [],
      problems: judged.problems,
      message: "The model answered, but the desk could not use the reply. No draft was saved.",
    };
  }
  const missing = judged.problems.length ? " Some styles were not saved." : "";
  return {
    unavailable: false,
    called: true,
    drafts: judged.drafts,
    problems: judged.problems,
    message: `Drafts are saved on the claim.${missing} Nothing was published.`,
  };
}

export async function requestOneStyle(input: {
  allowance: number;
  brief: DraftBrief;
  style: GeneratedStyle;
  hashtagAlreadyUsed: boolean;
  model: DraftModel;
}): Promise<DraftRequestResult> {
  if (input.allowance < 1) return unavailable(false);
  const prompt = draftPrompt(input.brief, input.style);
  let result: DraftModelResult;
  try {
    result = await input.model({ ...prompt, schema: draftSchema(input.style) });
  } catch {
    return unavailable(true);
  }
  if (!result.called || !result.ok) return unavailable(Boolean(result.called));
  const wrapped = input.style === "thread" ? { thread: result.data } : { [input.style]: result.data };
  const judged = judgeModelDrafts(wrapped, input.hashtagAlreadyUsed);
  const draft = judged.drafts.find((item) => item.style === input.style) ?? null;
  if (!draft) {
    return {
      unavailable: false,
      called: true,
      drafts: [],
      problems: judged.problems,
      message: judged.problems[0]?.reason || "The model answered, but that style could not be used. The previous draft was left as it was.",
    };
  }
  return {
    unavailable: false,
    called: true,
    drafts: [draft],
    problems: [],
    message: `${draft.label} was regenerated. Nothing was published.`,
  };
}
