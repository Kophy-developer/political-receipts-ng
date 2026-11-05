import "server-only";

export type ReprocessReport = {
  ok: false;
  xRequests: 0;
  detail: string;
  posted: false;
  polling: false;
};

/** The all-posts Gemini reprocess is retired. The Desk reprocesses one saved scan and does not call X. */
export async function reprocessStoredPosts(): Promise<ReprocessReport> {
  return {
    ok: false,
    xRequests: 0,
    detail: "Reprocess the saved scan from the Desk. No X request was made.",
    posted: false,
    polling: false,
  };
}
