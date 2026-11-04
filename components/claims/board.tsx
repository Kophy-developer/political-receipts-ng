"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DeskClaimSummary, DeskMode } from "@/lib/desk/types";
import type { ClaimStatus } from "@/lib/types";
import { PageFrame } from "@/components/shell/page-frame";
import { DemoMark, EmptyDesk, OriginNote, SectionHeading, StatusMark } from "@/components/marks";
import { cn } from "cn";

const filters: Array<ClaimStatus | "All"> = [
  "All",
  "New",
  "Researching",
  "Verified",
  "Contradicted",
  "Needs Context",
  "Unverified",
  "Dismissed",
];

export function ClaimsBoard({ claims, mode }: { claims: DeskClaimSummary[]; mode: DeskMode }) {
  const [filter, setFilter] = useState<ClaimStatus | "All">("All");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    return claims.filter((claim) => {
      const matchesFilter = filter === "All" || claim.status === filter;
      const haystack = `${claim.id} ${claim.claim} ${claim.handle} ${claim.topic} ${claim.speaker}`.toLowerCase();
      return matchesFilter && haystack.includes(query.trim().toLowerCase());
    });
  }, [claims, filter, query]);

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Claim detection"
          title="Sentences worth opening"
          dek="Each row is a claim filed in the database. A status is a stage of work, not a dare to publish."
        />
        <OriginNote mode={mode} />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors",
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
            placeholder="Search claim, handle, topic"
            aria-label="Search claims"
            className="h-9 w-full border border-rule bg-paper px-3 text-sm outline-none focus:border-ink lg:max-w-xs"
          />
        </div>
        {claims.length === 0 ? (
          <EmptyDesk title="No claims filed" body="The queue is empty. A claim appears here after it is written to the database, not from the old sample list." />
        ) : visible.length === 0 ? (
          <div className="border border-dashed border-rule bg-paper px-6 py-16 text-center">
            <p className="font-serif text-2xl">Nothing matches.</p>
            <p className="mt-2 text-sm text-ink-soft">Clear the filter or try a topic, a handle, or a phrase from the claim.</p>
          </div>
        ) : (
          <div className="border border-rule bg-paper">
            {visible.map((claim) => (
              <Link
                key={claim.id}
                href={`/claims/${claim.id}`}
                className="group grid gap-3 border-b border-rule px-4 py-5 transition-colors last:border-b-0 hover:bg-[#f6f1e8] md:grid-cols-[140px_minmax(0,1fr)_148px]"
              >
                <div>
                  <p className="font-mono text-[11px] tracking-[0.14em] text-ink">{claim.origin === "demo" ? <DemoMark /> : "Filed"}</p>
                  <p className="mt-2 text-xs text-ink-soft">{claim.topic}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">{claim.postedAt}</p>
                </div>
                <div className="min-w-0 border-l-0 pl-0 md:border-l md:border-transparent md:pl-4 md:group-hover:border-stamp">
                  <p className="font-serif text-[1.25rem] leading-snug tracking-[-0.02em]">{claim.claim}</p>
                  <p className="mt-2 text-sm text-ink-soft">
                    {claim.speaker} · {claim.handle}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
                  <StatusMark value={claim.status} />
                  <p className="font-mono text-[11px] text-ink-soft">{claim.virality ? `Spread ${claim.virality}` : "Spread not recorded"}</p>
                  <p className="font-mono text-[11px] text-ink-soft">
                    {claim.confidence === null ? "Confidence not scored" : `Confidence ${claim.confidence}`}
                  </p>
                  <p className="font-mono text-[11px] text-ink-soft">
                    {claim.evidenceCount} source{claim.evidenceCount === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
