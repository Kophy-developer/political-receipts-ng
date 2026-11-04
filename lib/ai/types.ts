export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AiJsonResult =
  | {
      ok: true;
      provider: string;
      model: string;
      promptVersion: string;
      data: unknown;
      usage: AiUsage;
    }
  | {
      ok: false;
      provider: string;
      model: string;
      promptVersion: string;
      message: string;
      usage: AiUsage;
    };

export type AiProvider = {
  name: string;
  model: string;
  completeJson(input: { promptVersion: string; system: string; user: string }): Promise<AiJsonResult>;
};
