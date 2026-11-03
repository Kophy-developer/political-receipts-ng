import type { DeskMode, FiledSource } from "@/lib/desk/types";
import { sourcePolicy, sourceTiers } from "@/lib/sources";
import { PageFrame } from "@/components/shell/page-frame";
import { DemoMark, EmptyDesk, OriginNote, SectionHeading, tierRail } from "@/components/marks";

export function Library({ sources, mode }: { sources: FiledSource[]; mode: DeskMode }) {
  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <SectionHeading
          kicker="Sources"
          title="What the desk will cite"
          dek="Trust is attached to a class of document, not to a political party. A spokesperson from any government is evidence of a position. The table underneath is the source."
        />
        <OriginNote mode={mode} />
        <aside className="border border-ink bg-paper px-5 py-5 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.16em] text-stamp uppercase">Standing rule</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">{sourcePolicy.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">{sourcePolicy.body}</p>
        </aside>
        {sources.length === 0 ? (
          <EmptyDesk title="No sources filed" body="The standing rule above is policy. A source card appears here only after it is stored, with an organisation, a title, and a retrieval time." />
        ) : null}
        <div className="space-y-10">
          {sourceTiers.map((tier) => {
            const group = sources.filter((source) => source.tier === tier);
            if (group.length === 0) return null;
            return (
              <section key={tier}>
                <div className="mb-3 flex items-center gap-3">
                  <span className={`h-4 w-1 ${tierRail[tier]}`} />
                  <h2 className="font-serif text-2xl tracking-[-0.02em]">{tier}</h2>
                </div>
                <div className="border border-rule bg-paper">
                  {group.map((source) => (
                    <article key={source.id} className="grid gap-4 border-b border-rule px-4 py-5 last:border-b-0 sm:px-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div>
                        <h3 className="font-serif text-xl leading-tight">{source.organization}</h3>
                        <p className="mt-2 text-xs text-ink-soft">{source.category}</p>
                        <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-soft">{source.published}</p>
                        {source.origin === "demo" ? <DemoMark /> : null}
                      </div>
                      <div>
                        <p className="text-sm leading-relaxed">{source.title}</p>
                        <p className="mt-2 text-xs text-ink-soft">Reliability {source.reliability}. Retrieved {source.retrievedAt}.</p>
                        <p className="mt-3 break-all font-mono text-[11px] text-ink-soft">{source.url ?? "No public URL filed"}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PageFrame>
  );
}
