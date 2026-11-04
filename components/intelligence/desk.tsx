"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AttentionLabel, DeskClassName, DeskConversation, DeskMode, ResearchCard } from "@/lib/desk/types";
import { formatNumber, growthLabel } from "@/lib/format";
import { PageFrame } from "@/components/shell/page-frame";
import { DemoMark, EmptyDesk, OriginNote, SectionHeading, StatusMark, VelocityMark } from "@/components/marks";
import { ScanControl } from "@/components/intelligence/scan-control";
import { cn } from "cn";

const filters = ["All", "Emerging", "Growing", "High attention", "Breaking", "Rapid", "Normal"] as const;
type BoardFilter = (typeof filters)[number];

function matchesBoard(item: DeskConversation, filter: BoardFilter) {
  if (filter === "All") return true;
  if (filter === "Emerging" || filter === "High attention") return item.attention === filter;
  if (filter === "Growing") return item.attention === "Growing" || item.velocity === "Growing";
  return item.velocity === filter;
}

function classLabel(value: DeskClassName | null) {
  if (value === "actionable") return "Actionable intelligence";
  if (value === "discussion") return "Political discussion";
  if (value === "noise") return "Noise";
  return null;
}

function growthText(item: DeskConversation) {
  if (item.growthPct !== null) return growthLabel(item.growthPct);
  if (item.attention) return "Not calculated";
  return "Not recorded";
}

export function IntelligenceDesk({
  conversations,
  mode,
  queue,
  queueInstalled,
}: {
  conversations: DeskConversation[];
  mode: DeskMode;
  queue: ResearchCard[];
  queueInstalled: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("topic");
  const activeId = conversations.some((item) => item.id === requested) ? requested! : conversations[0]?.id ?? "";
  const [filter, setFilter] = useState<BoardFilter>("All");
  const [query, setQuery] = useState("");
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return conversations.filter((item) => {
      const matchesFilter = matchesBoard(item, filter);
      const haystack = `${item.title} ${item.topic} ${item.summary} ${item.entities.join(" ")}`.toLowerCase();
      return matchesFilter && haystack.includes(query.trim().toLowerCase());
    });
  }, [conversations, filter, query]);

  const active = conversations.find((item) => item.id === activeId) ?? visible[0] ?? null;

  function choose(id: string) {
    router.replace(`/intelligence?topic=${id}`, { scroll: false });
  }

  async function act(id: string, action: "dismiss" | "investigate") {
    setBusyId(id);
    setQueueError(null);
    try {
      const response = await fetch("/api/intel/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) setQueueError(body.message || "The desk could not update that claim.");
      if (action === "investigate") router.push(`/claims/${id}`);
      else router.refresh();
    } catch {
      setQueueError("The desk could not update that claim.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Live intelligence"
          title="What is moving"
          dek="A scan runs only when you start it. One search, then it stops. If a conversation is worth saying something about, it belongs on Opportunities."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
            The button prices the next search before anything is sent. It does not post, reply, or leave a watcher running.
          </p>
          <ScanControl />
        </div>
        <OriginNote mode={mode} />
        <section className="flex flex-col gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-stamp uppercase">Claims needing research</p>
            <p className="mt-1 max-w-2xl text-sm text-ink-soft">Checkable sentences from a scan. Dismiss keeps the post. Investigate opens the dossier. Nothing here is a verdict.</p>
          </div>
          {queueError ? <p className="text-sm text-stamp">{queueError}</p> : null}
          {!queueInstalled ? (
            <div className="border border-dashed border-rule bg-paper px-5 py-6">
              <p className="font-serif text-xl">The research queue is not installed yet.</p>
              <p className="mt-2 text-sm text-ink-soft">Apply the intelligence migration before a scan. The button will refuse to call X until those tables exist.</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="border border-dashed border-rule bg-paper px-5 py-6">
              <p className="font-serif text-xl">No claims are waiting.</p>
              <p className="mt-2 text-sm text-ink-soft">A scan files a card only when a post contains a sentence a record could check.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {queue.map((card) => (
                <article key={card.id} className="border border-rule bg-paper p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase", card.importance === "High" ? "bg-stamp-soft text-stamp" : card.importance === "Medium" ? "bg-amber-soft text-amber" : "bg-slateink-soft text-slateink")}>
                      {card.importance}
                    </span>
                    {classLabel(card.deskClass) ? <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{classLabel(card.deskClass)}</span> : null}
                    <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{card.topic}</span>
                    <StatusMark value={card.status} />
                  </div>
                  <h2 className="mt-3 font-serif text-xl leading-snug">{card.claim}</h2>
                  <p className="mt-2 text-sm text-ink-soft">
                    {card.speaker} <span className="font-mono text-xs">{card.handle}</span>
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-ink-soft sm:grid-cols-4">
                    <div>Posts {card.conversationSize}</div>
                    <div>Engagement {formatNumber(card.engagement)}</div>
                    <div>AI confidence {card.aiConfidence ?? "Not stated"}</div>
                    <div>{card.entities.length ? card.entities.slice(0, 3).join(", ") : "No entity filed"}</div>
                  </dl>
                  <p className="mt-3 text-sm leading-relaxed">{card.importanceReason}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={busyId === card.id} onClick={() => act(card.id, "investigate")} className="inline-flex h-9 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50">
                      Investigate
                    </button>
                    <button type="button" disabled={busyId === card.id} onClick={() => act(card.id, "dismiss")} className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50">
                      Dismiss
                    </button>
                    {card.postUrl ? (
                      <a href={card.postUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center px-3 text-sm underline decoration-rule underline-offset-4">
                        Open original post
                      </a>
                    ) : (
                      <span className="inline-flex h-9 items-center px-3 text-sm text-ink-soft">No public post URL</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors",
                  filter === item ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-soft hover:border-ink/30 hover:text-ink",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search discussion or entity"
            aria-label="Search conversations"
            className="h-9 w-full border border-rule bg-paper px-3 text-sm outline-none placeholder:text-ink-soft/70 focus:border-ink sm:max-w-xs"
          />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="border border-rule bg-paper">
            {conversations.length === 0 ? (
              <EmptyDesk title="No conversations filed" body="Nothing is watched automatically. A conversation appears here after a scan files one." />
            ) : visible.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="font-serif text-2xl">Nothing on this slice.</p>
                <p className="mt-2 text-sm text-ink-soft">Clear the search or widen the velocity filter.</p>
              </div>
            ) : (
              visible.map((item) => {
                const selected = item.id === active?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => choose(item.id)}
                    className={cn(
                      "flex w-full flex-col gap-3 border-b border-rule px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-[#f6f1e8] sm:flex-row",
                      selected && "bg-[#f6f1e8]",
                    )}
                  >
                    <span className={cn("mt-1 hidden w-0.5 shrink-0 self-stretch sm:block", selected ? "bg-stamp" : "bg-transparent")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-serif text-lg leading-tight">{item.title}</span>
                        {item.origin === "demo" ? <DemoMark /> : null}
                        {item.attention ? <AttentionMark value={item.attention} /> : item.velocity ? <VelocityMark value={item.velocity} /> : null}
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-ink-soft">{item.summary}</span>
                      <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft sm:grid-cols-4">
                        <span>{item.volume === null ? "Volume not recorded" : `Vol ${formatNumber(item.volume)}`}</span>
                        <span>{growthText(item)}</span>
                        <span>{item.firstDetected}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <aside id="conversation" className="border border-rule bg-paper lg:sticky lg:top-6">
            {!active ? (
              <p className="px-5 py-8 text-sm text-ink-soft">Select a conversation when the board has one.</p>
            ) : (
            <>
            <div className="border-b border-rule px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.16em] text-ink-soft uppercase">{active.topic}</p>
                  <h2 className="mt-1 font-serif text-2xl tracking-[-0.02em]">{active.title}</h2>
                  {classLabel(active.deskClass) ? <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{classLabel(active.deskClass)}</p> : null}
                </div>
                {active.attention ? <AttentionMark value={active.attention} /> : active.velocity ? <VelocityMark value={active.velocity} /> : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{active.velocityNote || "No velocity note is filed."}</p>
            </div>
            <div className="space-y-5 px-5 py-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Volume" value={active.volume === null ? "Not recorded" : formatNumber(active.volume)} />
                <Metric label="Growth" value={growthText(active)} />
                <Metric label="First detected" value={active.firstDetected} />
                <Metric label="Posts" value={active.postCount === null ? "Not recorded" : formatNumber(active.postCount)} />
                <Metric label="Record" value={active.origin === "demo" ? "Demonstration" : "Live"} />
              </dl>
              {active.narrative.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">Primary entities</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {active.entities.map((entity) => (
                    <li key={entity} className="border border-rule px-2 py-1 text-xs">
                      {entity}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-rule bg-[#f6f1e8] px-3 py-3 text-sm leading-relaxed">
                <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">Desk note</p>
                <p className="mt-1">{active.deskNote || "No desk note is filed."}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">Related claims</p>
                {active.relatedClaims.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">No claim has been opened from this conversation.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {active.relatedClaims.map((claim) => (
                      <li key={claim.id}>
                        <Link href={`/claims/${claim.id}`} className="block border border-rule px-3 py-2 transition-colors hover:border-ink/30">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-[0.12em]">Claim</span>
                            <StatusMark value={claim.status} />
                          </span>
                          <span className="mt-1 block text-sm leading-snug">{claim.claim}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            </>
            )}
          </aside>
        </div>
      </div>
    </PageFrame>
  );
}

function AttentionMark({ value }: { value: AttentionLabel }) {
  return <span className="border border-rule px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{value}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule px-3 py-2">
      <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 text-sm leading-snug">{value}</dd>
    </div>
  );
}

