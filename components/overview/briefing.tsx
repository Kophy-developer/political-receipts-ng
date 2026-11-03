import Link from "next/link";
import { posts } from "@/lib/archive";
import { claims } from "@/lib/claims";
import { conversations } from "@/lib/conversations";
import { draftPackages } from "@/lib/drafts";
import { formatCompact, formatNumber, growthLabel } from "@/lib/format";
import { telemetry } from "@/lib/system";
import { DeskClock } from "@/components/shell/desk-clock";
import { PageFrame } from "@/components/shell/page-frame";
import { SampleNote, StatusMark, VelocityMark } from "@/components/marks";

export function Briefing() {
  const impressions = posts.reduce((sum, post) => sum + post.impressions, 0);
  const emerging = conversations.filter((item) => item.velocity !== "Normal").length;
  const ready = draftPackages.filter((item) => item.ready);
  const moving = [...conversations].sort((a, b) => b.growthPct - a.growthPct).slice(0, 4);
  const queue = [...claims].sort((a, b) => b.viralityScore - a.viralityScore).slice(0, 5);
  const latest = posts.slice(0, 3);

  const kpis = [
    {
      label: "Political posts monitored",
      value: formatNumber(telemetry.postsMonitored),
      note: telemetry.postsMonitoredNote,
    },
    {
      label: "Emerging conversations",
      value: formatNumber(emerging),
      note: `${conversations.length} subjects on the board`,
    },
    {
      label: "Claims awaiting review",
      value: formatNumber(claims.length),
      note: "Open investigations on this desk",
    },
    {
      label: "Drafts ready",
      value: formatNumber(ready.length),
      note: "Cleared for an editor, not for X",
    },
    {
      label: "Posts published",
      value: formatNumber(posts.length),
      note: "Human-approved sample archive",
    },
    {
      label: "Total impressions",
      value: formatCompact(impressions),
      note: "Sum of the sample archive",
    },
  ];

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <header className="flex flex-col justify-between gap-8 border-b border-ink pb-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.22em] text-stamp">PRNG · SAMPLE DAY {telemetry.sampleDay}</p>
            <h1 className="mt-3 font-serif text-[2.6rem] leading-[0.98] tracking-[-0.03em] text-ink sm:text-5xl">
              Political Receipts NG
            </h1>
            <p className="mt-3 font-serif text-xl italic text-ink-soft sm:text-2xl">Nigeria Political Intelligence</p>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Politics. Claims. Receipts. What is moving, what can be sourced, and what is waiting on a person. Nothing on this desk can publish itself.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <DeskClock />
            <div className="flex flex-wrap gap-2">
              <StatusChip live label="Monitoring" value="Live" />
              <StatusChip label="X" value="Not verified" />
              <StatusChip label="Gemini" value="Not configured" />
            </div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">
              Last sample pass {telemetry.lastPass}
            </p>
          </div>
        </header>
        <div className="-mt-6 h-px w-16 bg-stamp" />
        <SampleNote />
        <section aria-label="Desk figures">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="border border-rule bg-paper px-4 py-4 transition-colors hover:border-ink/25">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{kpi.label}</p>
                <p className="mt-3 font-serif text-[2rem] tabular-nums leading-none tracking-[-0.03em]">{kpi.value}</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-soft">{kpi.note}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-serif text-2xl tracking-[-0.02em]">Moving now</h2>
              <Link href="/intelligence" className="text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
                Full board
              </Link>
            </div>
            <div className="border border-rule bg-paper">
              {moving.map((item) => (
                <Link
                  key={item.id}
                  href={`/intelligence?topic=${item.id}`}
                  className="flex flex-col gap-3 border-b border-rule px-4 py-4 transition-colors last:border-b-0 hover:bg-[#f6f1e8] sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif text-lg leading-tight">{item.topic}</h3>
                      <VelocityMark value={item.velocity} />
                    </div>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">{item.summary}</p>
                  </div>
                  <p className="shrink-0 font-mono text-xs tabular-nums text-ink">
                    {formatNumber(item.volume)}
                    <span className="mt-1 block text-right text-ink-soft">{growthLabel(item.growthPct)}</span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-serif text-2xl tracking-[-0.02em]">Editor’s queue</h2>
              <Link href="/claims" className="text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
                All claims
              </Link>
            </div>
            <div className="border border-rule bg-paper">
              {queue.map((claim) => (
                <Link
                  key={claim.id}
                  href={`/claims/${claim.id}`}
                  className="block border-b border-rule px-4 py-4 transition-colors last:border-b-0 hover:bg-[#f6f1e8]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft">{claim.id.toUpperCase()}</p>
                    <StatusMark value={claim.status} />
                  </div>
                  <p className="mt-2 font-serif text-[17px] leading-snug">{claim.claim}</p>
                  <p className="mt-2 text-xs text-ink-soft">
                    {claim.handle} · {claim.topic} · virality {claim.viralityScore}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="grid gap-6 lg:grid-cols-3">
          <article className="border border-rule bg-paper p-4">
            <h2 className="font-serif text-xl">Drafts ready</h2>
            <ul className="mt-3 divide-y divide-rule">
              {ready.slice(0, 5).map((item) => {
                const claim = claims.find((entry) => entry.id === item.claimId);
                if (!claim) return null;
                return (
                  <li key={item.claimId} className="py-3">
                    <Link href={`/drafts?claim=${item.claimId}`} className="block hover:text-stamp">
                      <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft">{claim.id.toUpperCase()}</p>
                      <p className="mt-1 text-sm leading-snug">{claim.claim}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </article>
          <article className="border border-rule bg-paper p-4">
            <h2 className="font-serif text-xl">Latest in the archive</h2>
            <ul className="mt-3 divide-y divide-rule">
              {latest.map((post) => (
                <li key={post.id} className="py-3">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft">
                    {post.hashtag} · {post.publishedAt}
                  </p>
                  <p className="mt-1 text-sm leading-snug">{post.text}</p>
                </li>
              ))}
            </ul>
            <Link href="/published" className="mt-2 inline-block text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
              Open archive
            </Link>
          </article>
          <article className="border border-rule bg-paper p-4">
            <h2 className="font-serif text-xl">What this desk will not do</h2>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
              <li>It will not post to X. Authentication is not connected.</li>
              <li>It will not call Gemini. No model is configured.</li>
              <li>It will not treat a party, a campaign, or a spokesperson as a trusted source.</li>
              <li>It will not put #NotTrue on a claim the evidence only complicates.</li>
            </ul>
            <Link href="/settings" className="mt-4 inline-block text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
              Connection settings
            </Link>
          </article>
        </section>
      </div>
    </PageFrame>
  );
}

function StatusChip({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 border border-rule bg-paper px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-ink">
      {live ? <span className="pulse-dot size-1.5 rounded-full bg-forest" /> : <span className="size-1.5 rounded-full bg-ink-soft/50" />}
      {label}
      <span className="text-ink-soft">{value}</span>
    </span>
  );
}
