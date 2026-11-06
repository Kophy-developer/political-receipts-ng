import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/shell/page-frame";
import { loadSearchResults } from "@/lib/db/search-results";
import { loadStory } from "@/lib/db/editorial";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Story" };

export default function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <WorkBody params={params} />
    </Suspense>
  );
}

async function WorkBody({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const story = await loadStory(id);
  if (!story) notFound();
  const inventory = story.card.claimId ? await loadSearchResults(story.card.claimId) : null;
  const found = inventory?.results.length ?? 0;
  const opened = inventory?.results.filter((item) => item.retrievalStatus === "retrieved").length ?? story.sources.filter((item) => item.opened).length;
  const showInventory = found > 0 || story.sources.length > 0;

  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Story</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">{story.card.title}</h1>
      <p className="mt-3 text-sm">{story.card.storyState}</p>
      <p className="mt-2 text-sm leading-relaxed">{story.card.storyReason}</p>
      <p className="mt-2 text-sm text-ink-soft">{story.card.storyAction}</p>
      <div className="mt-8 space-y-6">
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Source</h2>
          <p className="mt-2 text-sm leading-relaxed">{story.card.sourceText || "No source text is stored on this card."}</p>
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Interpretation</h2>
          <p className="mt-2 text-sm leading-relaxed">{story.card.reason || story.card.title}</p>
          {story.card.developmentAngle ? <p className="mt-2 text-sm">Angle: {story.card.developmentAngle}</p> : null}
          {story.card.pillar ? <p className="mt-2 text-sm text-ink-soft">Pillar: {story.card.pillar}</p> : null}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Research</h2>
          <p className="mt-2 text-sm">{story.card.storyState}. {story.card.storyReason}</p>
          {showInventory ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>{found || story.sources.length} stored results · {opened} opened.</p>
              <ul className="space-y-1">
                {(story.sources.length > 0 ? story.sources : inventory?.results.map((item) => ({ title: item.title, opened: item.retrievalStatus === "retrieved", stance: item.reason })) ?? []).map((item, index) => (
                  <li key={`${item.title}-${index}`}>{item.opened ? "Opened" : "Not opened"} · {item.title}{item.stance ? ` · ${item.stance}` : ""}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">No research list is shown because research has not stored a result.</p>
          )}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Draft</h2>
          {story.drafts.length === 0 && story.card.developmentDrafts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No draft is stored.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {story.drafts.map((draft) => (
                <li key={draft.id} className="text-sm">
                  <p className="font-mono text-[11px] uppercase">{draft.version || "draft"} · {draft.status}</p>
                  <p className="mt-1 leading-relaxed">{draft.content}</p>
                </li>
              ))}
              {story.drafts.length === 0 ? story.card.developmentDrafts.map((text) => (
                <li key={text} className="text-sm leading-relaxed">{text}</li>
              )) : null}
            </ul>
          )}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Approval</h2>
          <p className="mt-2 text-sm">Publishing still requires the exact text and the checklist. This page does not send a post.</p>
          {story.card.claimId ? (
            <Link href={`/desk/${story.card.claimId}`} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper">Open the publish gate for this story</Link>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">This card has no claim yet, so the publish gate is not available.</p>
          )}
          <p className="mt-3 text-sm"><Link href="/desk" className="underline">Back to the desk</Link></p>
        </section>
      </div>
    </PageFrame>
  );
}
