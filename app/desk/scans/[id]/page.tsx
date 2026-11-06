import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/shell/page-frame";
import { loadScanCards } from "@/lib/db/editorial";
import { numberWithinScan } from "@/lib/desk/board";
import { isUuid } from "@/lib/db/labels";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Earlier scan" };

export default function ScanHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ScanHistory params={params} />
    </Suspense>
  );
}

async function ScanHistory({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const cards = numberWithinScan((await loadScanCards(id)).map((card) => ({
    ...card,
    rank: card.rank,
    discoveredAt: card.discoveredAt,
  })));
  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Earlier scan</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">This is not the latest scan.</h1>
      <p className="mt-3 text-sm text-ink-soft">These cards stay with the scan that created them. They are not mixed into This Scan on the desk. Stored ranks are unchanged.</p>
      {cards.length === 0 ? <p className="mt-6 text-sm">No current card belongs to this scan.</p> : (
        <ol className="mt-6 space-y-3">
          {cards.map((card) => (
            <li key={card.id} className="border border-rule px-4 py-4">
              <p className="font-mono text-[11px] uppercase">#{card.displayNumber} · Earlier scan · stored rank {card.rank ?? "none"}</p>
              <p className="mt-2 text-sm">{card.title}</p>
              <p className="mt-1 text-sm">{card.storyState}. {card.storyReason}</p>
              <Link href={`/desk/work/${card.id}`} className="mt-2 inline-flex h-11 items-center underline text-sm">Open story</Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-6 text-sm"><Link href="/desk" className="underline">Back to the desk</Link></p>
    </PageFrame>
  );
}
