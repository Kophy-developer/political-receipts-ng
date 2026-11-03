import { posts } from "@/lib/archive";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { demoInsights, groupPosts, sumPosts } from "@/lib/insights";
import { PageFrame } from "@/components/shell/page-frame";
import { SampleNote, SectionHeading } from "@/components/marks";
import type { GroupStat } from "@/lib/insights";

export function AnalyticsBoard() {
  const totals = sumPosts(posts);
  const insights = demoInsights(posts);
  const topics = groupPosts(posts, (post) => post.topic);
  const hooks = groupPosts(posts, (post) => post.hook);
  const engagementRate = totals.impressions ? totals.engagements / totals.impressions : 0;

  const tiles = [
    { label: "Total impressions", value: formatCompact(totals.impressions), note: "Sample archive" },
    { label: "Engagement", value: formatCompact(totals.engagements), note: formatPercent(engagementRate) + " of impressions" },
    { label: "Followers gained", value: formatNumber(totals.follows), note: "Attributed in the sample" },
    { label: "Profile visits", value: formatCompact(totals.profileVisits), note: "From archived posts" },
    { label: "Reposts", value: formatNumber(totals.reposts), note: "Sample archive" },
    { label: "Bookmarks", value: formatNumber(totals.bookmarks), note: "Sample archive" },
  ];

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <SectionHeading
          kicker="Analytics"
          title="What the sample archive did"
          dek="These figures are computed from the demonstration archive in this build. They are not X analytics. Connect the account before treating any rate as real."
        />
        <SampleNote />
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <article key={tile.label} className="border border-rule bg-paper px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{tile.label}</p>
              <p className="mt-3 font-serif text-[2rem] tabular-nums leading-none tracking-[-0.03em]">{tile.value}</p>
              <p className="mt-3 text-xs text-ink-soft">{tile.note}</p>
            </article>
          ))}
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          {insights.lines.map((line) => (
            <article key={line} className="border border-ink bg-paper px-4 py-4">
              <p className="font-mono text-[10px] tracking-[0.16em] text-stamp uppercase">Demo insight</p>
              <p className="mt-3 font-serif text-xl leading-snug">{line}</p>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                Mock insight, derived only from the sample archive. It will be replaced when real X analytics are connected.
              </p>
            </article>
          ))}
        </section>
        <div className="grid gap-6 xl:grid-cols-2">
          <Bars title="By topic" rows={topics} metric="impressions" />
          <Bars title="By hashtag" rows={insights.hashtags} metric="bookmarkRate" />
          <Bars title="By content format" rows={groupPosts(posts, (post) => post.format)} metric="engagementRate" />
          <Bars title="By hook style" rows={hooks} metric="engagementRate" />
          <Bars title="By posting time" rows={insights.windows} metric="engagementRate" />
          <article className="border border-rule bg-paper px-5 py-5">
            <h2 className="font-serif text-2xl">How to read the rates</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Bookmark rate is bookmarks divided by impressions. Engagement rate is engagements divided by impressions. A format can lead impressions and still lose the rate that editors care about. #ShowYourWorking is the habit this page is practising: the sentence and the table are both on the desk.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Content format in this archive is the hashtag family: #CheckAm, #ShowYourWorking, and #NotTrue. Hook style is separate, so a strong hook is not assumed to be the better post.
            </p>
          </article>
        </div>
      </div>
    </PageFrame>
  );
}

function Bars({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: GroupStat[];
  metric: "impressions" | "bookmarkRate" | "engagementRate";
}) {
  const max = Math.max(...rows.map((row) => row[metric]), 0.0001);
  return (
    <section className="border border-rule bg-paper px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Sample</p>
      </div>
      <ul className="mt-5 space-y-4">
        {rows.map((row) => {
          const width = `${(row[metric] / max) * 100}%`;
          const note =
            metric === "impressions"
              ? formatCompact(row.impressions)
              : metric === "bookmarkRate"
                ? `${formatPercent(row.bookmarkRate)} bookmarks`
                : `${formatPercent(row.engagementRate)} engagement`;
          return (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{row.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-soft">{note}</span>
              </div>
              <div className="mt-1.5 h-px bg-rule">
                <div className="h-1 -translate-y-px bg-ink" style={{ width }} />
              </div>
              <p className="mt-1 font-mono text-[10px] text-ink-soft">
                {row.count} posts · {formatCompact(row.impressions)} impr.
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
