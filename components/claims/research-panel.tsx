"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeskClaim, DeskEvidence } from "@/lib/desk/types";
import type { ResearchPlan } from "@/lib/research/types";

const verdicts = ["SUPPORTED", "CONTRADICTED", "MISLEADING", "NEEDS CONTEXT", "UNVERIFIED", "INSUFFICIENT EVIDENCE"] as const;
const stances = [
  ["supports", "Supports"],
  ["contradicts", "Contradicts"],
  ["contextualizes", "Context"],
  ["attribution_only", "Attribution only"],
] as const;

const pillarLabel: Record<string, string> = {
  politics: "Politics",
  football: "Manchester United",
  finance: "Finance",
};

export function ResearchPanel({ claim, plan }: { claim: DeskClaim; plan: ResearchPlan | null }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [verdict, setVerdict] = useState(claim.proposedVerdict && verdicts.includes(claim.proposedVerdict as (typeof verdicts)[number]) ? claim.proposedVerdict : "INSUFFICIENT EVIDENCE");
  const [working, setWorking] = useState(claim.workingNotes ?? "");
  const configured = plan?.providerConfigured === true;

  async function post(path: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(payload.message || (payload.ok ? "Saved." : "That did not save."));
      if (payload.ok) router.refresh();
    } catch {
      setMessage("The desk could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const questions = plan?.questions.length ? plan.questions.map((item) => item.question) : claim.questions;
  const types = plan?.claimTypes.length ? plan.claimTypes : claim.claimTypes;
  const searches = plan?.searches ?? [];

  return (
    <section className="border border-ink bg-paper">
      <header className="border-b border-rule px-5 py-4 sm:px-6">
        <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Find evidence</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          This is a plan. Nothing is searched until you begin research, and a search stays off until the server has a research key.
        </p>
      </header>
      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Claim</p>
          <p className="mt-2 text-sm leading-relaxed">{claim.claim}</p>
          <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Pillar and kind</p>
          <p className="mt-2 text-sm">
            {pillarLabel[claim.pillar ?? plan?.pillar ?? ""] ?? "No pillar filed"} · {claim.statementKind ?? plan?.statementKind ?? "Not classified"}
          </p>
          <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Claim type</p>
          <p className="mt-2 text-sm">{types.length ? types.join(" · ") : "Not classified yet"}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Research questions</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">These stay separate. A pack summary is not a verdict.</p>
          {questions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No questions are filed.</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-2 pl-4 text-sm leading-relaxed">
              {questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
          )}
          {plan ? (
            <div className="mt-4 border border-rule px-3 py-3">
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase">Evidence quality: {plan.quality.label}</p>
              <p className="mt-2 text-sm leading-relaxed">{plan.quality.reason}</p>
              <ul className="mt-3 space-y-2">
                {plan.problems.map((item) => (
                  <li key={item.question} className="text-sm leading-relaxed">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase">{item.label}. </span>
                    {item.question} {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="lg:col-span-2">
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Planned source categories</p>
          {plan && plan.sourceCategories.length > 0 ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {plan.sourceCategories.map((category) => (
                <li key={category.rank} className="border border-rule px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase">Tier {category.rank} · {category.name}</p>
                  <p className="mt-2 text-sm leading-relaxed">{category.notes}</p>
                  <p className="mt-2 break-words font-mono text-[11px] text-ink-soft">
                    {category.domains.length ? category.domains.join(", ") : "No domain is pinned to this tier."}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Source tiers are not installed yet, so research stays closed.</p>
          )}
          <div className="mt-4 space-y-3">
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Searches this run</p>
            <p className="text-sm leading-relaxed">
              {plan?.stageLabel ?? "Stage 1 · Primary source"}. Target authority: {plan?.authority ?? "Not chosen"}. Maximum search operations: {plan?.maxSearchOperations ?? 3}. Maximum document retrievals: {plan?.maxDocumentOperations ?? 2}. Provider: {plan?.providerName ?? "Tavily"}.
            </p>
            {plan?.outcome ? <p className="text-sm">{plan.outcome}</p> : null}
            {searches.length === 0 ? (
              <p className="text-sm text-ink-soft">No search is scheduled.</p>
            ) : (
              <ol className="space-y-3">
                {searches.map((item) => (
                  <li key={`${item.stage}-${item.query}`} className="border border-rule px-3 py-3 text-sm">
                    <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">{item.stageLabel}</p>
                    <p className="mt-2">{item.question}</p>
                    <p className="mt-2">Target authority: {item.authority}</p>
                    <p className="mt-1 break-words">Target domains: {item.domains.length ? item.domains.join(", ") : "No domain constraint on this stage"}</p>
                    <p className="mt-1">Search query: {item.query}</p>
                    <p className="mt-1">Maximum operations: {plan?.maxSearchOperations ?? 3} searches, {plan?.maxDocumentOperations ?? 2} documents</p>
                  </li>
                ))}
              </ol>
            )}
            {plan?.directNote ? <p className="text-sm leading-relaxed text-ink-soft">{plan.directNote}</p> : null}
            {plan?.outside.length ? (
              <div>
                <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Returned outside this stage</p>
                <ul className="mt-2 space-y-2">
                  {plan.outside.map((item) => (
                    <li key={item.url} className="text-sm leading-relaxed">
                      <span className="break-all font-mono text-[11px]">{item.url}</span>
                      <span className="mt-1 block text-ink-soft">{item.reason} Not retrieved.</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <p className="mt-4 text-sm">A thin result does not switch providers. Search second provider only runs when you click it. Opening the next source tier shows that plan first. It spends a search only after you use the plan and begin research.</p>
          {plan?.awaitingReview ? (
            <div className="mt-4">
              <p className="max-w-2xl text-sm leading-relaxed">This plan changed. Review the searches above, then use this plan. No search runs until you do.</p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post("/api/research/plan", { claimId: claim.id, action: "accept" }, "accept-plan")}
                className="mt-3 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
              >
                {busy === "accept-plan" ? "Saving…" : "Use this plan"}
              </button>
            </div>
          ) : null}
          {plan?.alreadyRun ? <p className="mt-4 text-sm">This research plan has already been run.</p> : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {configured && !plan?.awaitingReview && !plan?.alreadyRun ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post("/api/research/run", { claimId: claim.id }, "run")}
                className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
              >
                {busy === "run" ? "Researching…" : "Begin research"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => post("/api/research/plan", { claimId: claim.id, action: "change" }, "change-plan")}
              className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
            >
              {busy === "change-plan" ? "Rewriting…" : "Change research plan"}
            </button>
            {plan?.nextStage === "independent" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post("/api/research/plan", { claimId: claim.id, action: "advance" }, "advance")}
                className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
              >
                {busy === "advance" ? "Preparing…" : "Search independent sources"}
              </button>
            ) : null}
            {plan?.nextStage === "context" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post("/api/research/plan", { claimId: claim.id, action: "advance" }, "advance")}
                className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
              >
                {busy === "advance" ? "Preparing…" : "Search broader context"}
              </button>
            ) : null}
            {configured && !plan?.awaitingReview ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post("/api/research/second", { claimId: claim.id }, "second")}
                className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
              >
                {busy === "second" ? "Asking…" : "Search second provider"}
              </button>
            ) : null}
          </div>
          {configured ? null : (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed">
              Begin research is off. Set {plan?.credential ?? "TAVILY_API_KEY"} on the server. No search is sent until that key exists.
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-rule px-5 py-5 sm:px-6">
        <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Add a source by URL</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Paste an authoritative page. The server fetches a short excerpt and keeps the original URL. Private hosts and metadata addresses are refused.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            post("/api/research/source", { claimId: claim.id, url }, "source");
          }}
        >
          <label className="sr-only" htmlFor={`source-url-${claim.id}`}>
            Source URL
          </label>
          <input
            id={`source-url-${claim.id}`}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            className="h-10 min-w-0 flex-1 border border-rule bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          <button type="submit" disabled={busy !== null || !url.trim()} className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50">
            {busy === "source" ? "Retrieving…" : "Retrieve page"}
          </button>
        </form>
      </div>
      {claim.evidence.length > 0 ? (
        <div className="border-t border-rule px-5 py-5 sm:px-6">
          <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Review the passages</h3>
          <div className="mt-3 space-y-4">
            {claim.evidence.map((item) => (
              <EvidenceControls key={item.id} item={item} claimId={claim.id} busy={busy} onPost={post} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="border-t border-rule px-5 py-5 sm:px-6">
        <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Proposed verdict</h3>
        <p className="mt-2 text-sm text-ink-soft">Proposed. Not published, and not a post.</p>
        <p className="mt-3 font-serif text-3xl leading-none">{claim.proposedVerdict ?? "INSUFFICIENT EVIDENCE"}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed">{claim.verdictReasoning || "No reasoning is filed yet."}</p>
        {claim.verdictCaveats ? <p className="mt-2 max-w-3xl text-sm leading-relaxed">Caveat: {claim.verdictCaveats}</p> : null}
        {claim.verdictUnknown ? <p className="mt-2 max-w-3xl text-sm leading-relaxed">Still unknown: {claim.verdictUnknown}</p> : null}
        <p className="mt-2 text-sm">Confidence: {claim.verdictConfidence ?? "Not scored"}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed">
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Attribution </span>
          {claim.attribution || "Whether the words were published is still separate from whether they are true."}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="text-sm">
            <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Change proposed verdict</span>
            <select
              value={verdict}
              onChange={(event) => setVerdict(event.target.value)}
              className="mt-1 block h-10 w-full border border-rule bg-paper px-2 text-sm sm:w-64"
            >
              {verdicts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => post("/api/research/review", { claimId: claim.id, action: "set_verdict", verdict, working }, "verdict")}
            className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
          >
            Save proposed verdict
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => post("/api/research/review", { claimId: claim.id, action: "accept_verdict" }, "accept")}
            className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            Record on the claim
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => post("/api/research/review", { claimId: claim.id, action: "request_more" }, "more")}
            className="inline-flex h-10 items-center border border-rule px-4 text-sm disabled:opacity-50"
          >
            Request more research
          </button>
        </div>
        <label className="mt-4 block max-w-3xl text-sm">
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Working for #ShowYourWorking</span>
          <textarea
            value={working}
            onChange={(event) => setWorking(event.target.value)}
            rows={4}
            className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            placeholder="The arithmetic, the comparison, or the timeline a reader could redo."
          />
        </label>
        {message ? <p className="mt-4 max-w-2xl text-sm">{message}</p> : null}
      </div>
    </section>
  );
}

function EvidenceControls({
  item,
  claimId,
  busy,
  onPost,
}: {
  item: DeskEvidence;
  claimId: string;
  busy: string | null;
  onPost: (path: string, body: Record<string, unknown>, key: string) => Promise<void>;
}) {
  const [stance, setStance] = useState(item.stance);
  const [tier, setTier] = useState(String(item.tierRank));
  return (
    <article className="border border-rule px-3 py-3">
      <p className="text-sm">
        {item.organization} · tier {item.tierRank} · {item.review}
      </p>
      <p className="mt-1 break-all font-mono text-[11px] text-ink-soft">{item.url ?? "No public URL"}</p>
      {item.reliabilityNotes ? <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.reliabilityNotes}</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onPost("/api/research/review", { claimId, action: "accept_evidence", evidenceId: item.id }, item.id)}
          className="inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onPost("/api/research/review", { claimId, action: "reject_evidence", evidenceId: item.id }, item.id)}
          className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50"
        >
          Reject
        </button>
        <label className="text-sm">
          <span className="sr-only">Relationship</span>
          <select value={stance} onChange={(event) => setStance(event.target.value as DeskEvidence["stance"])} className="h-9 border border-rule bg-paper px-2">
            {stances.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onPost("/api/research/review", { claimId, action: "set_stance", evidenceId: item.id, stance }, item.id)}
          className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50"
        >
          Save relationship
        </button>
        <label className="text-sm">
          <span className="sr-only">Source tier</span>
          <select value={tier} onChange={(event) => setTier(event.target.value)} className="h-9 border border-rule bg-paper px-2">
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
            <option value="4">Tier 4</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onPost("/api/research/review", { claimId, action: "set_tier", evidenceId: item.id, tierRank: Number(tier) }, item.id)}
          className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50"
        >
          Save tier
        </button>
      </div>
    </article>
  );
}
