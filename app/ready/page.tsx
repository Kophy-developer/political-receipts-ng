import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageFrame } from "@/components/shell/page-frame";
import { listClaims } from "@/lib/db/claims";
import { listPipeline } from "@/lib/db/editorial";
import { listExactFinalPosts } from "@/lib/db/final-post";
import { publishedByClaim } from "@/lib/db/publishing";
import { arrangeDesk } from "@/lib/desk/board";
import { latestScanHeadline } from "@/lib/db/desk-home";
import { postShape } from "@/lib/editorial/model";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Ready for You" };

export default function ReadyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReadyBody />
    </Suspense>
  );
}

async function ReadyBody() {
  await connection();
  const [pipeline, scan, claims, published, finals] = await Promise.all([
    listPipeline(),
    latestScanHeadline(),
    listClaims(),
    publishedByClaim(),
    listExactFinalPosts(),
  ]);
  const readyCards = arrangeDesk(pipeline.cards, scan?.id ?? null).ready;
  const drafts = claims.ok
    ? claims.claims.flatMap((claim) => {
        if (published.has(claim.id) || claim.status === "Dismissed") return [];
        const finalPost = finals.get(claim.id);
        if (!finalPost) return [];
        const shape = postShape(finalPost.text);
        return [{ id: claim.id, title: claim.claim, shape: shape.shape, count: shape.count }];
      })
    : [];
  const empty = readyCards.length === 0 && drafts.length === 0;
  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Ready for You</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Waiting for a decision.</h1>
      <p className="mt-3 text-sm text-ink-soft">Nothing here is published until you confirm the exact text.</p>
      {empty ? <p className="mt-6 text-sm">Nothing is ready to publish.</p> : (
        <ul className="mt-6 space-y-3">
          {readyCards.map((card) => (
            <li key={card.id} className="border border-rule px-4 py-4">
              <p className="text-sm">{card.title}</p>
              <p className="mt-1 text-sm">{card.storyState}. {card.storyReason}</p>
              {card.developmentDrafts[0] ? <p className="mt-2 text-sm leading-relaxed">{card.developmentDrafts[0]}</p> : null}
              <Link href={`/desk/work/${card.id}`} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper">Open this story</Link>
            </li>
          ))}
          {drafts.map((item) => (
            <li key={item.id} className="border border-rule px-4 py-4">
              <p className="text-sm">{item.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{item.shape} · {item.count} characters</p>
              <Link href={`/desk/${item.id}`} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper">Open the publish gate</Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
