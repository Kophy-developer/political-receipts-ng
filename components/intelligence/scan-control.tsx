"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { extractionLabel, type ExtractionOutcome } from "@/lib/intel/outcome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Estimate = {
  ready: boolean;
  message: string | null;
  groupName: string | null;
  maxXRequests: number;
  maxPosts: number;
  maxGeminiRequests: number;
  lookbackHours: number;
  minEngagement: number;
  xRemaining: number;
  postsRemaining: number;
  geminiRemaining: number;
  postCeilingUsd: string;
  authorCeilingUsd: string;
  rateNote: string;
};

type Report = {
  ok: boolean;
  stopped: string | null;
  xRequests: number;
  postsReturned: number;
  postsStored: number;
  relevantPosts: number;
  actionablePosts?: number;
  discussionPosts?: number;
  noisePosts?: number;
  conversations: number;
  claims: number;
  claimsDropped: number;
  extraction?: ExtractionOutcome | null;
  extractionDetail?: string | null;
  model?: string | null;
  geminiRequests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  errors: string[];
  posted: false;
  polling: false;
};

export function ScanControl() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openEstimate() {
    setOpen(true);
    setLoading(true);
    setReport(null);
    setError(null);
    try {
      const response = await fetch("/api/intel/estimate", { cache: "no-store" });
      const body = (await response.json()) as Estimate;
      setEstimate(body);
      if (!response.ok && !body.message) setError("The desk could not price this scan.");
    } catch {
      setEstimate(null);
      setError("The desk could not price this scan.");
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/intel/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as Report;
      setReport(body);
      if (!body.ok && body.stopped) setError(body.stopped);
      router.refresh();
    } catch {
      setError("The scan did not return. No further request was sent from this page.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openEstimate}
        className="inline-flex h-11 items-center bg-stamp px-4 font-mono text-[11px] tracking-[0.16em] text-paper uppercase transition-colors hover:bg-stamp/85"
      >
        Run intelligence scan
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Before the scan</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              One manual search. Nothing is posted, and the desk does not keep watching after this request.
            </DialogDescription>
          </DialogHeader>
          {loading ? <p className="text-sm text-ink-soft">Checking the ceiling…</p> : null}
          {estimate ? (
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                At most <strong>{estimate.maxXRequests}</strong> X search request and <strong>{estimate.maxPosts}</strong> posts, looking back{" "}
                <strong>{estimate.lookbackHours}</strong> hours. Group: <strong>{estimate.groupName ?? "none"}</strong>.
              </p>
              <p>
                Published ceiling for the posts: {estimate.postCeilingUsd}. If X also bills the author records on that page, add up to {estimate.authorCeilingUsd}.{" "}
                {estimate.rateNote}
              </p>
              <p>
                Gemini calls this scan can make: {estimate.maxGeminiRequests}. Remaining today — X requests {estimate.xRemaining}, posts {estimate.postsRemaining}, Gemini {estimate.geminiRemaining}.
                Minimum engagement kept: {estimate.minEngagement}.
              </p>
              {estimate.message ? <p className="border border-rule bg-[#f6f1e8] px-3 py-2">{estimate.message}</p> : null}
            </div>
          ) : null}
          {report ? (
            <dl className="grid grid-cols-2 gap-2 border border-rule p-3 font-mono text-[11px]">
              <div>X requests {report.xRequests}</div>
              <div>Posts returned {report.postsReturned}</div>
              <div>Posts stored {report.postsStored}</div>
              <div>Relevant {report.relevantPosts}</div>
              <div>Actionable {report.actionablePosts ?? 0}</div>
              <div>Discussion {report.discussionPosts ?? 0}</div>
              <div>Noise {report.noisePosts ?? 0}</div>
              <div>Conversations {report.conversations}</div>
              <div>Claims extracted {report.claims}</div>
              <div>Gemini requests {report.geminiRequests}</div>
              <div>Rejected by validation {report.claimsDropped}</div>
              <div className="col-span-2">Extraction {report.extraction ? extractionLabel(report.extraction) : "—"}</div>
              {report.model ? <div className="col-span-2">Model {report.model}</div> : null}
              <div>Input tokens {report.inputTokens ?? "—"}</div>
              <div>Output tokens {report.outputTokens ?? "—"}</div>
              <div>Duration {report.durationMs} ms</div>
              <div>Posted {report.posted ? "yes" : "no"}</div>
            </dl>
          ) : null}
          {error ? <p className="text-sm text-stamp">{error}</p> : null}
          {report?.errors?.length ? (
            <ul className="space-y-1 text-sm text-ink-soft">
              {report.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center px-3 text-sm text-ink-soft">
              Close
            </button>
            <button
              type="button"
              onClick={run}
              disabled={!estimate?.ready || running || loading}
              className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
            >
              {running ? "Scanning…" : "Run this scan"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
