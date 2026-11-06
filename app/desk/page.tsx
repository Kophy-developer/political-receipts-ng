import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DeskDiscover } from "@/components/desk/discover";
import { ScanBoard, type BoardCard } from "@/components/desk/scan-board";
import { PageFrame } from "@/components/shell/page-frame";
import { listClaims } from "@/lib/db/claims";
import { listPipeline } from "@/lib/db/editorial";
import { latestScanHeadline } from "@/lib/db/desk-home";
import { listExactFinalPosts } from "@/lib/db/final-post";
import { publishedByClaim } from "@/lib/db/publishing";
import { listRecentScans } from "@/lib/db/reprocess-jobs";
import { loadDiscoveryContext } from "@/lib/db/pillars";
import { arrangeDesk } from "@/lib/desk/board";
import { postShape, type PipelineCard } from "@/lib/editorial/model";
import { chicagoStamp } from "@/lib/format";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Desk" };

export default function DeskPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DeskHome />
    </Suspense>
  );
}

function viewOf(card: PipelineCard, older: boolean): BoardCard {
  return {
    id: card.id,
    claimId: card.claimId,
    title: card.title,
    sourceText: card.sourceText,
    storyState: card.storyState,
    storyReason: card.storyReason,
    storyAction: card.storyAction,
    pillar: card.pillar,
    lifecycle: card.lifecycle,
    lowValue: card.lowValue,
    older,
  };
}

async function DeskHome() {
  await connection();
  const [pipeline, scan, discovery, recent, claims, published, finals] = await Promise.all([
    listPipeline(),
    latestScanHeadline(),
    loadDiscoveryContext(),
    listRecentScans(8),
    listClaims(),
    publishedByClaim(),
    listExactFinalPosts(),
  ]);
  const arranged = arrangeDesk(pipeline.cards, scan?.id ?? null);
  const scanCards = pipeline.cards.filter((card) => scan && card.scanId === scan.id);
  const understood = scanCards.filter((card) => card.lifecycle !== "PASSED").length;
  const passed = scanCards.filter((card) => card.lifecycle === "PASSED").length;
  const attention = scanCards.filter((card) => card.storyState === "Needs attention" || card.storyState === "Evidence insufficient").length;
  const readyClaims = claims.ok
    ? claims.claims.flatMap((claim) => {
        if (published.has(claim.id) || claim.status === "Dismissed") return [];
        const finalPost = finals.get(claim.id);
        if (!finalPost) return [];
        const shape = postShape(finalPost.text);
        return [{ id: claim.id, title: claim.claim, text: finalPost.text, shape: shape.shape, count: shape.count }];
      })
    : [];

  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Desk</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">The desk</h1>
      <p className="mt-3 text-sm text-ink-soft">This scan, then the stories you are working, then what is ready for you. Older scans stay in history.</p>
      <div className="mt-8 space-y-10">
        <section className="border border-rule px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Latest scan</p>
          {scan ? (
            <div className="mt-3 space-y-1 text-sm">
              <p>{scan.startedAt ? chicagoStamp(scan.startedAt) : "Start time not recorded"} · {scan.status}</p>
              <p>Pillar: {scan.pillar}{scan.query ? ` · ${scan.query}` : ""}</p>
              <p>{scan.posts} posts retrieved · {scan.conversations ?? "an unrecorded number of"} new conversations</p>
              <p>Understanding for this scan: {understood} open, {passed} passed, {attention} need attention.</p>
              {scan.error ? <p>Error: {scan.error}</p> : scan.status === "failed" || scan.status === "stopped" ? <p>The scan stopped without a stored error.</p> : <p>No scan error recorded.</p>}
              {scan.extraction && scan.error ? <p>{scan.extraction}</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm">No scan is stored yet.</p>
          )}
        </section>
        <DeskDiscover
          scanId={scan?.id ?? null}
          postsSaved={scan?.posts ?? 0}
          storedConversations={scan?.conversations ?? 0}
          job={null}
          latestOpportunities={[]}
          provider="Not recorded"
          reason={scan?.error ?? "No error recorded"}
          signals={discovery.signals}
          publishedTotal={discovery.publishedTotal}
          mix={discovery.mix.items}
        />
        <ScanBoard
          thisScan={arranged.thisScan.map((card) => viewOf(card, false))}
          working={arranged.working.map((card) => viewOf(card, Boolean(scan && card.scanId !== scan.id)))}
          earlier={arranged.earlier.map((card) => viewOf(card, true))}
          passed={arranged.passed.map((card) => viewOf(card, true))}
        />
        <section id="ready">
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Ready for You</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Drafts waiting for a decision.</h2>
          {readyClaims.length === 0 && arranged.ready.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">Nothing is ready to publish.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {arranged.ready.map((card) => (
                <li key={card.id} className="border border-rule px-4 py-4">
                  <p className="text-sm">{card.title}</p>
                  <p className="mt-1 text-sm">{card.storyState}. {card.storyReason}</p>
                  <Link href={card.claimId ? `/desk/${card.claimId}` : `/desk/work/${card.id}`} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper">Open the publish gate</Link>
                </li>
              ))}
              {readyClaims.map((item) => (
                <li key={item.id} className="border border-rule px-4 py-4">
                  <p className="text-sm">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{item.shape} · {item.count} characters. Exact text, not published.</p>
                  <Link href={`/desk/${item.id}`} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper">Open the publish gate</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <details>
          <summary className="cursor-pointer font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Earlier scans</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {recent.filter((item) => item.id !== scan?.id).map((item) => (
              <li key={item.id} className="border border-rule px-3 py-3">
                <p>{chicagoStamp(item.startedAt)} · {item.posts} posts · {item.analysis}</p>
                <Link href={`/desk/scans/${item.id}`} className="mt-1 inline-block underline">Open this scan</Link>
              </li>
            ))}
            {recent.filter((item) => item.id !== scan?.id).length === 0 ? <li>No earlier scan is stored.</li> : null}
          </ul>
        </details>
        {pipeline.history.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-sm">Previous assessment versions</summary>
            <p className="mt-2 text-sm text-ink-soft">Older cards from the same conversation. They are not current.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {pipeline.history.map((item) => (
                <li key={item.id} className="border border-rule px-3 py-3">
                  <p>{item.title}</p>
                  <p className="mt-1 text-ink-soft">version {item.version ?? "earlier"} · not current</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="text-sm"><Link href="/archive" className="underline">Archive and history</Link></p>
      </div>
    </PageFrame>
  );
}
