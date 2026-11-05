import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DeskDiscover } from "@/components/desk/discover";
import { EditorialPipeline, PassedOver, type ReadyItem } from "@/components/desk/pipeline";
import { PageFrame } from "@/components/shell/page-frame";
import { listClaims } from "@/lib/db/claims";
import { listPipeline } from "@/lib/db/editorial";
import { loadFinalPost } from "@/lib/db/final-post";
import { publishedByClaim } from "@/lib/db/publishing";
import { latestReprocessJob, listRecentScans } from "@/lib/db/reprocess-jobs";
import { latestDeskScan } from "@/lib/intel/saved-scan";
import { loadDiscoveryContext } from "@/lib/db/pillars";
import { inProgressLifecycle, lifecycleLabel, postShape, queueLifecycle, readyLifecycle, researchLabel } from "@/lib/editorial/model";
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
  const published = result.ok ? await publishedByClaim() : new Map();
  const cards = result.ok
    ? await Promise.all(result.claims.map(async (claim) => {
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
        return { claim, action: nextAction(facts), publication, finalPost };
      }))
    : [];
  const pipeline = await listPipeline();
  const scan = await latestDeskScan();
  const discovery = await loadDiscoveryContext();
  const reprocess = scan ? await latestReprocessJob(scan.scanId) : null;
  const recent = await listRecentScans(5);
  const readyIds = new Set(
    cards.filter((card) => card.finalPost && !card.publication).map((card) => card.claim.id),
  );
  const ready: ReadyItem[] = cards.flatMap((card) => {
    if (!card.finalPost || card.publication || card.claim.status === "Dismissed") return [];
    const shape = postShape(card.finalPost.text);
    const accepted = card.claim.evidence.filter((item) => item.review === "accepted");
    return [{
      id: card.claim.id,
      kind: "claim" as const,
      title: card.claim.claim,
      text: card.finalPost.text,
      type: card.claim.format?.current ?? "Story",
      why: card.claim.editorAngleText || card.claim.importanceReason || "The editor already has a final draft.",
      evidence: accepted.length > 0 ? `${accepted.length} accepted source${accepted.length === 1 ? "" : "s"} on the story.` : null,
      sources: card.finalPost.sources,
      count: shape.count,
      shape: shape.shape,
      href: `/desk/${card.claim.id}`,
    }];
  });
  for (const item of pipeline.cards) {
    if (!readyLifecycle(item.lifecycle) || (item.claimId && readyIds.has(item.claimId))) continue;
    const shape = postShape(item.angle || item.title);
    ready.push({
      id: item.id,
      kind: "opportunity",
      title: item.title,
      text: item.angle || item.reason,
      type: item.type,
      why: item.reason,
      evidence: null,
      sources: [],
      count: shape.count,
      shape: shape.shape,
      href: item.claimId ? `/desk/${item.claimId}` : "/opportunities",
    });
  }
  const queue = pipeline.cards.filter((item) => queueLifecycle(item.lifecycle));
  const working = pipeline.cards.filter((item) => inProgressLifecycle(item.lifecycle));
  const passed = pipeline.cards.filter((item) => item.lifecycle === "PASSED");
  const earlier = pipeline.earlier.filter((item) => item.status !== "ignored");
  const inProgress = cards.filter((card) => !card.publication && !card.finalPost && card.claim.status !== "Dismissed");
  const recentlyPublished = cards.filter((card) => card.publication);

  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Desk</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">The desk</h1>
      {!result.ok ? <p className="mt-4 text-sm">The stories could not be read. Nothing was published.</p> : null}
      <div className="mt-8 space-y-10">
        <DeskDiscover
          scanId={scan?.scanId ?? null}
          postsSaved={scan?.postsSaved ?? 0}
          job={reprocess}
          latestOpportunities={[]}
          provider={scan?.provider ?? "Not recorded"}
          reason={scan?.reason ?? "The analysis did not finish"}
          signals={discovery.signals}
          publishedTotal={discovery.publishedTotal}
          mix={discovery.mix.items}
        />
        <EditorialPipeline
          ready={ready}
          queue={queue}
          earlier={earlier}
          migrationPending={pipeline.reason === "pending"}
        />
        <section>
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">In progress</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Research and drafts already open.</h2>
          {inProgress.length === 0 && working.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">No story is in progress. A research job starts only when an opportunity needs it.</p>
          ) : null}
          {inProgress.length > 0 || working.length > 0 ? (
            <ul className="mt-4 space-y-4">
              {working.map((item) => (
                <li key={item.id} className="border border-rule px-5 py-5">
                  <p className="font-serif text-2xl leading-snug tracking-[-0.02em]">{item.title}</p>
                  <p className="mt-2 text-sm text-ink-soft">{lifecycleLabel(item.lifecycle)} · {researchLabel(item.research)}</p>
                </li>
              ))}
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
          ) : null}
        </section>
        <section>
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Recently published</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Completed posts.</h2>
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
        <PassedOver passed={passed} />
        <section>
          <details>
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Recent scans</summary>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No scan is stored.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {recent.map((item) => (
                  <li key={item.id} className="border border-rule px-3 py-3">
                    <p>{chicagoStamp(item.startedAt)}</p>
                    <p>{item.posts} posts retrieved</p>
                    <p>{item.analysis}</p>
                    <p>{item.opportunities === null ? "Opportunities not linked" : `${item.opportunities} ${item.opportunities === 1 ? "opportunity" : "opportunities"}`}</p>
                    <p>Provider: {item.provider}</p>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
      </div>
    </PageFrame>
  );
}
