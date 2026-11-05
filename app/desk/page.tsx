import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DeskDiscover, type DeskOpportunityView } from "@/components/desk/discover";
import { EmptyDesk } from "@/components/marks";
import { PageFrame } from "@/components/shell/page-frame";
import { listClaims } from "@/lib/db/claims";
import { loadFinalPost } from "@/lib/db/final-post";
import { publishedByClaim } from "@/lib/db/publishing";
import { listOpportunityDesk } from "@/lib/db/opportunities";
import { discoveryAction, selectDeskOpportunities } from "@/lib/desk/discover";
import { nextAction, type StoryFacts } from "@/lib/desk/story";
import { chicagoStamp } from "@/lib/format";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Desk" };

export default function DeskPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DeskQueue />
    </Suspense>
  );
}

async function DeskQueue() {
  await connection();
  const result = await listClaims();
  if (!result.ok) {
    return (
      <PageFrame>
        <EmptyDesk title="Desk unavailable" body="The stories could not be read. Nothing was published." />
      </PageFrame>
    );
  }
  const published = await publishedByClaim();
  const cards = await Promise.all(result.claims.map(async (claim) => {
    const finalPost = await loadFinalPost(claim.id);
    const publication = published.get(claim.id) ?? null;
    const facts: StoryFacts = {
      hasConversation: Boolean(claim.postText && claim.postText !== "The original post text has not been filed."),
      acceptedEvidence: claim.evidence.filter((item) => item.review === "accepted").length
        || claim.verdictEvidenceUsed.filter((item) => item.kind !== "original allegation").length,
      verdictRecorded: Boolean(claim.verdictRecordedAt),
      angleChosen: Boolean(claim.editorAngle),
      finalText: finalPost?.text ?? "",
      published: Boolean(publication),
    };
    return { claim, action: nextAction(facts), facts, publication };
  }));
  const storyIds = new Set(cards.map((card) => card.claim.id));
  const opportunities = await deskOpportunities(storyIds, cards);
  const inProgress = cards.filter((card) => !card.publication);
  const recentlyPublished = cards.filter((card) => card.publication);
  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Desk</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">The desk</h1>
      <div className="mt-8 space-y-10">
        <DeskDiscover opportunities={opportunities} />
        <section>
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">In progress</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Stories already being worked on.</h2>
          {inProgress.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">No story is in progress.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {inProgress.map(({ claim, action }) => (
                <li key={claim.id} className="border border-rule px-5 py-5">
                  <p className="font-serif text-2xl leading-snug tracking-[-0.02em]">{claim.claim}</p>
                  <p className="mt-2 text-sm text-ink-soft">{claim.proposedVerdict ?? claim.status}{claim.verdictConfidence ? ` · ${claim.verdictConfidence}` : ""}</p>
                  {action ? (
                    <Link href={`/desk/${claim.id}`} className="mt-5 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper">
                      {action}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Recently published</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Recently completed work.</h2>
          {recentlyPublished.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">Nothing from this desk has been published.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {recentlyPublished.map(({ claim, publication }) => (
                <li key={claim.id} className="border border-rule px-5 py-5">
                  <p className="font-serif text-2xl leading-snug tracking-[-0.02em]">{claim.claim}</p>
                  <p className="mt-2 text-sm text-ink-soft">Published {publication?.publishedAt ? chicagoStamp(publication.publishedAt) : ""}</p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <Link href={`/desk/${claim.id}`} className="underline">Open story</Link>
                    {publication?.url ? <a href={publication.url} className="underline">View post</a> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

async function deskOpportunities(
  storyIds: Set<string>,
  cards: Array<{ claim: { id: string }; facts: StoryFacts }>,
): Promise<DeskOpportunityView[]> {
  const desk = await listOpportunityDesk();
  if (!desk.ok) return [];
  const factsOf = new Map(cards.map((card) => [card.claim.id, card.facts]));
  return selectDeskOpportunities(desk.items, storyIds).flatMap((item) => {
    const facts = item.claimId ? factsOf.get(item.claimId) ?? null : null;
    const action = discoveryAction({
      type: item.type,
      research: item.research,
      status: item.status,
      editorAngle: item.editorAngle,
      editorTake: item.editorTake,
      claim: facts ? { published: Boolean(facts.published), facts } : null,
    });
    if (!action) return [];
    return [{
      id: item.id,
      title: item.whatHappened,
      action,
      href: item.claimId ? `/desk/${item.claimId}` : "/opportunities",
    }];
  });
}
