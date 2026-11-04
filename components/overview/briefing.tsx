import Link from "next/link";
import type { DeskSnapshot } from "@/lib/desk/types";
import { formatNumber, growthLabel } from "@/lib/format";
import { DeskClock } from "@/components/shell/desk-clock";
import { PageFrame } from "@/components/shell/page-frame";
import { DemoMark, EmptyDesk, OriginNote, StatusMark, VelocityMark } from "@/components/marks";

export function Briefing({ snapshot, gemini = "Not configured" }: { snapshot: DeskSnapshot; gemini?: string }) {
  const blocked = snapshot.mode === "unconfigured" || snapshot.mode === "unreachable";
  const kpis = [
    { label: "Claims filed", value: blocked ? "—" : formatNumber(snapshot.counts.claims), note: "Rows in the claims table" },
    { label: "Conversations", value: blocked ? "—" : formatNumber(snapshot.counts.conversations), note: "Subjects on the board" },
    { label: "Drafts ready", value: blocked ? "—" : formatNumber(snapshot.counts.draftsReady), note: "Cleared for an editor, not sent" },
    { label: "Posts published", value: blocked ? "—" : formatNumber(snapshot.counts.published), note: "Recorded after a confirmed send" },
  ];

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <header className="flex flex-col justify-between gap-8 border-b border-ink pb-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.22em] text-stamp">PRNG · EDITORIAL DESK</p>
            <h1 className="mt-3 font-serif text-[2.6rem] leading-[0.98] tracking-[-0.03em] text-ink sm:text-5xl">Political Receipts NG</h1>
            <p className="mt-3 font-serif text-xl italic text-ink-soft sm:text-2xl">Politics, finance, and Manchester United</p>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              One person, three interests. Curious, willing to be sharp, and able to say when the record is missing. Counts on this page come from the database.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <DeskClock />
            <div className="flex flex-wrap gap-2">
              <StatusChip label="Monitoring" value="Manual only" />
              <StatusChip label="X" value="Not verified" />
              <StatusChip label="Gemini" value={gemini} />
            </div>
          </div>
        </header>
        <div className="-mt-6 h-px w-16 bg-stamp" />
        <OriginNote mode={snapshot.mode} />
        <Mix mix={snapshot.mix} />
        <section aria-label="Desk figures">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="border border-rule bg-paper px-4 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{kpi.label}</p>
                <p className="mt-3 font-serif text-[2rem] tabular-nums leading-none tracking-[-0.03em]">{kpi.value}</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-soft">{kpi.note}</p>
              </article>
            ))}
          </div>
        </section>
        {snapshot.mode === "empty" ? (
          <EmptyDesk
            title="The desk is empty"
            body="No claims, conversations, or posts are filed. Automated monitoring has not started, and demonstration rows are not loaded unless someone runs the demo seed."
          />
        ) : null}
        {snapshot.mode === "unconfigured" ? (
          <EmptyDesk title="Database not configured" body="Set the Supabase URL and service role key on the server. The anon key cannot fill this desk." />
        ) : null}
        {snapshot.mode === "unreachable" ? (
          <EmptyDesk title="Database unreachable" body="The server could not read the editorial tables. Check the migration and the service role, then reload." />
        ) : null}
        {snapshot.mode !== "empty" && snapshot.mode !== "unconfigured" && snapshot.mode !== "unreachable" ? (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="font-serif text-2xl tracking-[-0.02em]">Conversations</h2>
                <Link href="/intelligence" className="text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
                  Full board
                </Link>
              </div>
              <div className="border border-rule bg-paper">
                {snapshot.moving.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-ink-soft">No conversations are filed.</p>
                ) : (
                  snapshot.moving.map((item) => (
                    <Link
                      key={item.id}
                      href={`/intelligence?topic=${item.id}`}
                      className="flex flex-col gap-3 border-b border-rule px-4 py-4 transition-colors last:border-b-0 hover:bg-[#f6f1e8] sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{item.topic}</p>
                          <h3 className="font-serif text-lg leading-tight">{item.title}</h3>
                          {item.origin === "demo" ? <DemoMark /> : null}
                          {item.attention ? <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{item.attention}</span> : item.velocity ? <VelocityMark value={item.velocity} /> : null}
                        </div>
                        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">{item.summary}</p>
                      </div>
                      <p className="shrink-0 font-mono text-xs tabular-nums text-ink">
                        {item.volume === null ? "Volume not recorded" : formatNumber(item.volume)}
                        {item.growthPct === null ? (
                          item.attention ? <span className="mt-1 block text-right text-ink-soft">Not calculated</span> : null
                        ) : (
                          <span className="mt-1 block text-right text-ink-soft">{growthLabel(item.growthPct)}</span>
                        )}
                      </p>
                    </Link>
                  ))
                )}
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
                {snapshot.queue.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-ink-soft">No claims are filed.</p>
                ) : (
                  snapshot.queue.map((claim) => (
                    <Link key={claim.id} href={`/claims/${claim.id}`} className="block border-b border-rule px-4 py-4 last:border-b-0 hover:bg-[#f6f1e8]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft">{claim.topic}</p>
                        <span className="flex items-center gap-2">
                          {claim.origin === "demo" ? <DemoMark /> : null}
                          <StatusMark value={claim.status} />
                        </span>
                      </div>
                      <p className="mt-2 font-serif text-[17px] leading-snug">{claim.claim}</p>
                      <p className="mt-2 text-xs text-ink-soft">
                        {claim.handle} · {claim.postedAt}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}
        <section className="grid gap-6 lg:grid-cols-3">
          <article className="border border-rule bg-paper p-4">
            <h2 className="font-serif text-xl">Drafts ready</h2>
            {snapshot.ready.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">None.</p>
            ) : (
              <ul className="mt-3 divide-y divide-rule">
                {snapshot.ready.map((item) => (
                  <li key={item.claimId} className="py-3">
                    <Link href={`/drafts?claim=${item.claimId}`} className="block hover:text-stamp">
                      <p className="text-sm leading-snug">{item.claim}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>
          <article className="border border-rule bg-paper p-4">
            <h2 className="font-serif text-xl">Latest recorded posts</h2>
            {snapshot.latest.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No real posts have been recorded.</p>
            ) : (
              <ul className="mt-3 divide-y divide-rule">
                {snapshot.latest.map((post) => (
                  <li key={post.id} className="py-3">
                    <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft">{post.publishedAt}</p>
                    <p className="mt-1 text-sm leading-snug">{post.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/published" className="mt-2 inline-block text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
              Open archive
            </Link>
          </article>
          <article className="border border-rule bg-paper p-4">
            <h2 className="font-serif text-xl">Performance</h2>
            <p className="mt-3 font-serif text-2xl">No real performance data yet</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Impressions and engagement are not invented from the sample archive. They appear only after a post metric is stored.
            </p>
            <Link href="/analytics" className="mt-4 inline-block text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
              Analytics
            </Link>
          </article>
        </section>
      </div>
    </PageFrame>
  );
}

function Mix({ mix }: { mix: DeskSnapshot["mix"] }) {
  return (
    <section aria-label="Content mix" className="border border-rule bg-paper px-4 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-serif text-2xl tracking-[-0.02em]">Rolling mix</h2>
        <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
          {mix.installed ? `Last ${mix.counted} live claims` : "Mix not installed"}
        </p>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        The marks at 60, 20, and 20 are a target over time. A busy political week can sit well above that line. The desk does not force the split.
      </p>
      <div className="mt-4 grid gap-4">
        {mix.items.map((item) => (
          <div key={item.pillar}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p>{item.label}</p>
              <p className="font-mono text-[11px] text-ink-soft">
                {item.count} · {item.share}% · target {item.target}%
              </p>
            </div>
            <div className="relative mt-2 h-2 bg-[#efe8dc]">
              <div className="h-2 bg-ink" style={{ width: `${Math.min(100, item.share)}%` }} />
              <span className="absolute top-[-3px] h-3.5 w-px bg-stamp" style={{ left: `${item.target}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-rule bg-paper px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-ink">
      <span className="size-1.5 rounded-full bg-ink-soft/50" />
      {label}
      <span className="text-ink-soft">{value}</span>
    </span>
  );
}
