"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DeskConversation, DeskMode } from "@/lib/desk/types";
import { formatNumber, growthLabel } from "@/lib/format";
import type { Velocity } from "@/lib/types";
import { PageFrame } from "@/components/shell/page-frame";
import { DemoMark, EmptyDesk, OriginNote, SectionHeading, StatusMark, VelocityMark } from "@/components/marks";
import { cn } from "cn";

const filters: Array<Velocity | "All"> = ["All", "Breaking", "Rapid", "Growing", "Normal"];

export function IntelligenceDesk({ conversations, mode }: { conversations: DeskConversation[]; mode: DeskMode }) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("topic");
  const activeId = conversations.some((item) => item.id === requested) ? requested! : conversations[0]?.id ?? "";
  const [filter, setFilter] = useState<Velocity | "All">("All");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    return conversations.filter((item) => {
      const matchesFilter = filter === "All" || item.velocity === filter;
      const haystack = `${item.topic} ${item.summary} ${item.entities.join(" ")}`.toLowerCase();
      return matchesFilter && haystack.includes(query.trim().toLowerCase());
    });
  }, [conversations, filter, query]);

  const active = conversations.find((item) => item.id === activeId) ?? visible[0] ?? null;

  function choose(id: string) {
    router.replace(`/intelligence?topic=${id}`, { scroll: false });
  }

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Live intelligence"
          title="What is moving"
          dek="Conversations filed in the database. Automated monitoring has not started, so an empty board is the honest state."
        />
        <OriginNote mode={mode} />
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
            placeholder="Search topic or entity"
            aria-label="Search conversations"
            className="h-9 w-full border border-rule bg-paper px-3 text-sm outline-none placeholder:text-ink-soft/70 focus:border-ink sm:max-w-xs"
          />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="border border-rule bg-paper">
            {conversations.length === 0 ? (
              <EmptyDesk title="No conversations filed" body="Nothing is being watched automatically. A conversation appears here when it is written to the database." />
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
                        <span className="font-serif text-lg leading-tight">{item.topic}</span>
                        {item.origin === "demo" ? <DemoMark /> : null}
                        {item.velocity ? <VelocityMark value={item.velocity} /> : null}
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-ink-soft">{item.summary}</span>
                      <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft sm:grid-cols-4">
                        <span>{item.volume === null ? "Volume not recorded" : `Vol ${formatNumber(item.volume)}`}</span>
                        <span>{item.growthPct === null ? "Growth not recorded" : growthLabel(item.growthPct)}</span>
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
                  <p className="font-mono text-[10px] tracking-[0.16em] text-ink-soft uppercase">Conversation</p>
                  <h2 className="mt-1 font-serif text-2xl tracking-[-0.02em]">{active.topic}</h2>
                </div>
                {active.velocity ? <VelocityMark value={active.velocity} /> : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{active.velocityNote || "No velocity note is filed."}</p>
            </div>
            <div className="space-y-5 px-5 py-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Volume" value={active.volume === null ? "Not recorded" : formatNumber(active.volume)} />
                <Metric label="Growth" value={active.growthPct === null ? "Not recorded" : growthLabel(active.growthPct)} />
                <Metric label="First detected" value={active.firstDetected} />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule px-3 py-2">
      <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 text-sm leading-snug">{value}</dd>
    </div>
  );
}

