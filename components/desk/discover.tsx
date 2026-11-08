"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { scanDeskSummary, type DiscoveryAction } from "@/lib/desk/discover";
import { understandConfirmation } from "@/lib/editorial/understand";
import { engagementOperator, parseEngagement, withEngagement, type EngagementSetting } from "@/lib/intel/engagement";
import { scanModes, type ContentPillar, type ScanMode } from "@/lib/pillars/catalog";
import { chooseScan, type PillarSignal, type ScanAllowance, type ScanChoice } from "@/lib/pillars/scan";
import { deskJobView, type ReprocessJob } from "@/lib/intel/progress";

export type DeskOpportunityView = {
  id: string;
  title: string;
  action: DiscoveryAction;
  href: string;
  scanId: string | null;
};

export type RecentScanView = {
  id: string;
  startedAt: string;
  posts: number;
  analysis: string;
  opportunities: number | null;
  provider: string;
};

type Found = { id: string; title: string; action: string; href?: string };

type Report = {
  ok: boolean;
  stopped: string | null;
  postsReturned: number;
  conversations: number;
  newConversations?: number;
  claims: number;
  opportunities?: number;
  found?: Found[];
  posted: false;
  polling: false;
};

type ReprocessReport = {
  ok: boolean;
  job: ReprocessJob | null;
  found?: Found[];
  detail: string;
};

export function DeskDiscover({
  scanId,
  postsSaved,
  storedConversations,
  job,
  latestOpportunities,
  provider,
  reason,
  signals,
  publishedTotal,
  mix,
  allowance,
  engagement,
  engagementReady,
  engagementMessage,
  nextGroups,
}: {
  scanId: string | null;
  postsSaved: number;
  storedConversations: number;
  job: ReprocessJob | null;
  latestOpportunities: DeskOpportunityView[];
  provider: string;
  reason: string;
  signals: PillarSignal[];
  publishedTotal: number;
  mix: Array<{ pillar: string; label: string; share: number; target: number }>;
  allowance: ScanAllowance;
  engagement: EngagementSetting;
  engagementReady: boolean;
  engagementMessage: string | null;
  nextGroups: Record<ContentPillar, { name: string; query: string } | null>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<ScanMode>("smart");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [currentJob, setCurrentJob] = useState<ReprocessJob | null>(job);
  const [found, setFound] = useState<Found[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reassessing, setReassessing] = useState(false);
  const [reassessNote, setReassessNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);
  const view = deskJobView({ job: currentJob, postsSaved, now });
  const summary = report
    ? scanDeskSummary({ postsReturned: report.postsReturned, conversations: report.newConversations ?? 0, claims: report.opportunities ?? report.claims })
    : null;
  const scanFound = report?.found ?? [];
  const active = view.kind === "running";

  useEffect(() => {
    if (!scanId || !active) return;
    let stop = false;
    const tick = async () => {
      const response = await fetch(`/api/intel/reprocess/status?scanId=${scanId}`);
      const body = (await response.json()) as { job: ReprocessJob | null };
      if (stop) return;
      if (body.job) setCurrentJob(body.job);
      setNow(Date.now());
    };
    const timer = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [scanId, active, currentJob?.requestId, currentJob?.phase]);

  async function reprocessSaved() {
    if (!scanId || busy.current || view.buttonDisabled) return;
    busy.current = true;
    setError(null);
    setNow(Date.now());
    setCurrentJob({
      id: "pending",
      scanId,
      requestId: "pending",
      phase: "preparing",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      posts: postsSaved,
      conversations: 0,
      opportunities: 0,
      provider: null,
      steps: [],
    });
    try {
      const response = await fetch("/api/intel/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      const body = (await response.json()) as ReprocessReport;
      if (body.job) setCurrentJob(body.job);
      setFound(body.found ?? []);
      if (!body.ok && !body.job) setError(body.detail);
      router.refresh();
    } catch {
      setError("Reprocessing did not finish. No X request was sent.");
    } finally {
      busy.current = false;
      setNow(Date.now());
    }
  }

  async function reassessSaved() {
    if (!scanId || reassessing) return;
    setReassessing(true);
    setReassessNote(null);
    setError(null);
    try {
      const response = await fetch("/api/intel/reassess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setReassessNote(body.message || (body.ok ? "Reassessed." : "Reassess did not finish."));
      if (body.ok) router.refresh();
    } catch {
      setReassessNote("Reassess did not finish. No X request was sent.");
    } finally {
      setReassessing(false);
    }
  }

  async function runScan() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/intel/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
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

  const results = view.kind === "complete"
    ? (found.length > 0 ? found.map((item) => ({ id: item.id, title: item.title, action: item.action, href: `/desk/${item.id}` })) : latestOpportunities)
    : [];

  return (
    <section className="border border-rule px-5 py-5">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Discover</p>
      <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Find something worth talking about.</h2>
      <div className="mt-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">Last 20 published posts</p>
        <ul className="mt-2 space-y-1 text-sm">
          {mix.map((item) => (
            <li key={item.pillar} className="flex items-baseline justify-between gap-4">
              <span>{item.label}</span>
              <span>{item.share}% <span className="text-ink-soft">target {item.target}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Scan mode">
        {scanModes.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
            className={`inline-flex h-9 items-center border px-3 text-sm ${mode === item ? "border-ink bg-ink text-paper" : "border-rule"}`}
          >
            {item === "smart" ? "Smart scan" : item === "manchester_united" ? "Manchester United" : item === "finance" ? "Finance" : "Politics"}
          </button>
        ))}
      </div>
      <EngagementSettingForm saved={engagement} blocked={engagementMessage} />
      <button
        type="button"
        onClick={() => { setConfirming(true); setError(null); }}
        className="mt-4 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper"
      >
        Scan X
      </button>
      {confirming ? (
        <ScanConfirm
          choice={chooseScan(mode, signals, publishedTotal, allowance)}
          running={running}
          engagement={engagement}
          engagementReady={engagementReady}
          nextGroups={nextGroups}
          onRun={() => void runScan()}
        />
      ) : null}
      {scanId ? (
        <div className="mt-6 border border-rule px-4 py-4 text-sm">
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Historical extraction</p>
          {view.lines.map((line) => <p key={line} className="mt-2">{line}</p>)}
          {view.trail.length > 0 ? (
            <div className="mt-3">
              <p>{view.trail.map((item) => item.label).join(" → ")}</p>
              <p className="mt-1">Now: {view.trail.find((item) => item.state === "current")?.label}</p>
            </div>
          ) : null}
          {view.chain.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {view.chain.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
          {view.kind === "ready" ? (
            <>
              <p className="mt-2">Provider: {provider}</p>
              <p>Reason: {reason}</p>
            </>
          ) : null}
          {view.button ? (
            <button
              type="button"
              onClick={() => void reprocessSaved()}
              disabled={view.buttonDisabled || running}
              className="mt-4 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
            >
              {view.button}
            </button>
          ) : null}
          <p className="mt-4 font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Understanding</p>
          <p className="mt-2 text-sm text-ink-soft">Separate from the historical extraction above. This action reads the stored posts and writes a new understanding. It does not change the extraction count.</p>
          <dl className="mt-3 space-y-1 text-sm text-ink-soft">
            {understandConfirmation(storedConversations).map((line) => <div key={line}>{line}</div>)}
          </dl>
          <button
            type="button"
            onClick={() => void reassessSaved()}
            disabled={reassessing || running}
            className="mt-4 inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
          >
            {reassessing ? "Understanding…" : "Understand saved conversations"}
          </button>
          <p className="mt-4 font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Understanding outcome</p>
          {reassessNote ? <p className="mt-2">{reassessNote}</p> : <p className="mt-2 text-sm text-ink-soft">No new understanding has been run from this page yet.</p>}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-stamp">{error}</p> : null}
      {summary ? (
        <div className="mt-4 text-sm leading-relaxed">
          <p>{summary.posts}</p>
          <p>{summary.conversations}</p>
          <p>{summary.opportunities}</p>
        </div>
      ) : null}
      {view.kind === "complete" && results.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {results.map((item) => (
            <li key={item.id} className="border border-rule px-3 py-3">
              <p className="text-sm leading-relaxed">{item.title}</p>
              <Link href={item.href} className="mt-3 inline-flex h-9 items-center bg-ink px-3 text-sm text-paper">{item.action}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      {scanFound.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {scanFound.map((item) => (
            <li key={item.id} className="border border-rule px-3 py-3">
              <p className="text-sm leading-relaxed">{item.title}</p>
              <Link href={item.href ?? (item.action === "INVESTIGATE" ? `/desk/${item.id}?from=discover` : `/desk/work/${item.id}?from=discover`)} className="mt-3 inline-flex h-9 items-center bg-ink px-3 text-sm text-paper">Open story</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ScanConfirm({
  choice,
  running,
  engagement,
  engagementReady,
  nextGroups,
  onRun,
}: {
  choice: ScanChoice;
  running: boolean;
  engagement: EngagementSetting;
  engagementReady: boolean;
  nextGroups: Record<ContentPillar, { name: string; query: string } | null>;
  onRun: () => void;
}) {
  const title = choice.mode === "smart" ? "Smart scan" : choice.label;
  const group = nextGroups[choice.pillar];
  const built = group ? withEngagement(group.query, engagement) : null;
  const canRun = choice.runnable && engagementReady && built?.ok === true;
  return (
    <div className="mt-4 border border-ink px-4 py-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase">{title}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-ink-soft">Selected pillar</dt>
          <dd>{choice.label}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Reason</dt>
          <dd>{choice.reason}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Search group</dt>
          <dd>{group?.name ?? "None"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Query sent to X</dt>
          <dd className="mt-1 break-all font-mono text-xs leading-relaxed">{built?.ok ? built.query : "No query will be sent."}</dd>
        </div>
        <div>Expected X requests: {choice.estimatedRequests}</div>
        <div>Expected post reads: up to {choice.maximumPosts}</div>
      </dl>
      <p className="mt-3 text-sm text-ink-soft">{choice.requestNote}</p>
      <p className="mt-2 text-sm text-ink-soft">One search. {choice.scope}. X applies {engagementOperator(engagement)} before any post reaches this desk. A result of zero stays zero. Nothing is sent until you run it.</p>
      {built && !built.ok ? <p className="mt-2 text-sm">{built.message}</p> : null}
      {!engagementReady ? <p className="mt-2 text-sm">The saved threshold could not be read. No X request will be made.</p> : null}
      {choice.unconfigured.length > 0 ? (
        <p className="mt-2 text-sm">Unconfigured: {choice.unconfigured.map((pillar) => pillar === "manchester_united" ? "Manchester United" : pillar === "finance" ? "Finance" : "Politics").join(", ")}.</p>
      ) : null}
      {canRun ? (
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="mt-4 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
        >
          {running ? "Scanning…" : "Run scan"}
        </button>
      ) : (
        <p className="mt-4 text-sm">This scan will not be sent.</p>
      )}
    </div>
  );
}

function EngagementSettingForm({ saved, blocked }: { saved: EngagementSetting; blocked: string | null }) {
  const router = useRouter();
  const source = `${saved.metric}:${saved.minimum}`;
  const [draft, setDraft] = useState<{ source: string; metric: EngagementSetting["metric"]; minimum: string } | null>(null);
  const metric = draft?.source === source ? draft.metric : saved.metric;
  const minimum = draft?.source === source ? draft.minimum : String(saved.minimum);
  const [note, setNote] = useState<string | null>(blocked);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const parsed = parseEngagement({ metric, minimum });
  const dirty = !parsed.ok || parsed.setting.metric !== saved.metric || parsed.setting.minimum !== saved.minimum;

  async function save() {
    if (busy.current || !parsed.ok) return;
    busy.current = true;
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch("/api/desk/engagement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metric: parsed.setting.metric, minimum: parsed.setting.minimum }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setNote(body.message ?? "The threshold was not saved. No X request was made.");
      if (body.ok) router.refresh();
    } catch {
      setNote("The threshold was not saved. No X request was made.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border border-rule px-4 py-4">
      <p className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">Engagement threshold</p>
      <p className="mt-2 text-sm text-ink-soft">X filters with this operator before a post reaches the desk. The desk does not discard posts for low engagement after they arrive. Engagement is not a measure of whether a claim is true, and it is not used to aim a political post at an audience.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-sm">
          <span className="text-ink-soft">Count</span>
          <select
            value={metric}
            onChange={(event) => setDraft({ source, metric: event.target.value as EngagementSetting["metric"], minimum })}
            className="mt-1 block h-10 w-full border border-rule bg-paper px-2 sm:w-40"
          >
            <option value="replies">Replies (min_replies)</option>
            <option value="likes">Likes (min_likes)</option>
            <option value="reposts">Reposts (min_reposts)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-ink-soft">Minimum</span>
          <input
            value={minimum}
            inputMode="numeric"
            onChange={(event) => setDraft({ source, metric, minimum: event.target.value })}
            className="mt-1 block h-10 w-full border border-rule bg-paper px-2 sm:w-28"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !parsed.ok || !dirty}
          className="inline-flex h-10 items-center border border-ink px-3 text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save threshold"}
        </button>
      </div>
      <p className="mt-3 font-mono text-xs">Saved operator: {engagementOperator(saved)}</p>
      {!parsed.ok ? <p className="mt-2 text-sm text-stamp">{parsed.message}</p> : null}
      {dirty && parsed.ok ? <p className="mt-2 text-sm">Save this threshold before the next scan. Confirmation uses the saved operator.</p> : null}
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
    </div>
  );
}

