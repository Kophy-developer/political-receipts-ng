"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { scanConfirmation, scanDeskSummary, type DiscoveryAction } from "@/lib/desk/discover";

export type DeskOpportunityView = {
  id: string;
  title: string;
  action: DiscoveryAction;
  href: string;
};

type Found = { id: string; title: string; action: string };

type Report = {
  ok: boolean;
  stopped: string | null;
  postsReturned: number;
  conversations: number;
  newConversations?: number;
  claims: number;
  found?: Found[];
  posted: false;
  polling: false;
};

export function DeskDiscover({ opportunities }: { opportunities: DeskOpportunityView[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = report ? scanDeskSummary({ postsReturned: report.postsReturned, conversations: report.newConversations ?? 0, claims: report.claims }) : null;
  const found = report?.found ?? [];

  async function runScan() {
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
    <section className="border border-rule px-5 py-5">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Discover</p>
      <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Find something worth talking about.</h2>
      <button
        type="button"
        onClick={() => { setConfirming(true); setError(null); }}
        className="mt-4 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper"
      >
        Scan X
      </button>
      {confirming ? (
        <div className="mt-4 border border-ink px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase">Scan X</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div>Current scope: {scanConfirmation.scope}</div>
            <div>Search: {scanConfirmation.search}</div>
            <div>Maximum: {scanConfirmation.maximumPosts} posts</div>
            <div>Estimated X requests: {scanConfirmation.estimatedRequests}</div>
          </dl>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-soft">Advanced details</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              This runs the existing Intelligence scan, including its daily request and post-read limits. The search group and query stay on Intelligence.
            </p>
            <Link href="/intelligence" className="mt-2 inline-block text-sm underline">Open Intelligence</Link>
          </details>
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={running}
            className="mt-4 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            {running ? "Scanning…" : "Run scan"}
          </button>
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
      {found.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {found.map((item) => (
            <li key={item.id} className="border border-rule px-3 py-3">
              <p className="text-sm leading-relaxed">{item.title}</p>
              <Link href={`/desk/${item.id}`} className="mt-3 inline-flex h-9 items-center bg-ink px-3 text-sm text-paper">{item.action}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      {opportunities.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {opportunities.map((item) => (
            <li key={item.id} className="border border-rule px-3 py-3">
              <p className="text-sm leading-relaxed">{item.title}</p>
              <Link href={item.href} className="mt-3 inline-flex h-9 items-center bg-ink px-3 text-sm text-paper">{item.action}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
