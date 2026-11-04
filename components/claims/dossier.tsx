import Link from "next/link";
import type { DeskClaim, DeskMode } from "@/lib/desk/types";
import { PageFrame } from "@/components/shell/page-frame";
import { ClassificationWord, DemoMark, OriginNote, StatusMark, tierRail } from "@/components/marks";
import { FindEvidence } from "@/components/intelligence/find-evidence";

export function Dossier({ claim, mode }: { claim: DeskClaim; mode: DeskMode }) {
  const initials = claim.handle.replace("@", "").slice(0, 2).toUpperCase();

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/claims" className="underline decoration-rule underline-offset-4 hover:decoration-stamp">
            Claims
          </Link>
          <span className="text-ink-soft">/</span>
          <span className="font-mono text-[11px] tracking-[0.14em]">{claim.origin === "demo" ? "Demonstration claim" : "Filed claim"}</span>
          {claim.origin === "demo" ? <DemoMark /> : null}
        </div>
        <header className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[11px] tracking-[0.18em] text-stamp uppercase">{claim.topic}</p>
            <StatusMark value={claim.status} />
          </div>
          <p className="mt-4 font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">The claim</p>
          <h1 className="mt-2 border-l-2 border-stamp pl-4 font-serif text-[1.85rem] leading-[1.2] tracking-[-0.025em] sm:text-[2.35rem]">
            {claim.claim}
          </h1>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Speaker</dt>
              <dd className="mt-1">{claim.speaker}</dd>
              <dd className="font-mono text-xs text-ink-soft">{claim.handle}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Posted</dt>
              <dd className="mt-1">{claim.postedAt}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Virality</dt>
              <dd className="mt-1">{claim.virality ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Verification confidence</dt>
              <dd className="mt-1">{claim.confidence ?? "Not scored"}</dd>
            </div>
          </dl>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Importance</dt>
              <dd className="mt-1">{claim.importance ?? "Not ranked"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">AI confidence</dt>
              <dd className="mt-1">{claim.aiConfidence ?? "Not stated"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Editorial format</dt>
              <dd className="mt-1">{claim.format.current}</dd>
            </div>
          </dl>
        </header>
        <section className="grid gap-4 lg:grid-cols-2">
          <Brief label="Who said it" body={`${claim.speaker} (${claim.handle}). ${claim.role}.`} />
          <Brief label="Where it came from" body={claim.postUrl ? claim.postUrl : "No public post URL is filed."} />
          <Brief label="Why it matters" body={claim.importanceReason || "This claim has not been ranked. A rank, when present, uses reach and checkability, not who it helps."} />
          <Brief label="What we need to verify" body={claim.evidenceNeeded || claim.verifiability || "No verification note is filed yet."} />
        </section>
        {claim.entities.length > 0 ? (
          <p className="text-sm">
            <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Entities </span>
            {claim.entities.join(" · ")}
          </p>
        ) : null}
        <OriginNote mode={mode} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
          <section className="border border-rule bg-paper">
            <header className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Original post</h2>
              <span className="font-mono text-[10px] tracking-[0.14em] text-amber uppercase">{claim.postUrl ? "Linked" : "No live embed"}</span>
            </header>
            <div className="p-4 sm:p-5">
              <div className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-mono text-xs text-paper">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-medium">{claim.speaker}</p>
                  <p className="font-mono text-xs text-ink-soft">
                    {claim.handle} · {claim.role}
                  </p>
                  <p className="font-mono text-xs text-ink-soft">{claim.postedAt}</p>
                </div>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed">{claim.postText}</p>
              {claim.engagement ? (
                <dl className="mt-4 grid grid-cols-4 border-t border-rule pt-3 text-center font-mono text-[11px]">
                  <div>
                    <dt className="text-ink-soft">Replies</dt>
                    <dd className="mt-1">{claim.engagement.replies}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">Reposts</dt>
                    <dd className="mt-1">{claim.engagement.reposts}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">Likes</dt>
                    <dd className="mt-1">{claim.engagement.likes}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">Views</dt>
                    <dd className="mt-1">{claim.engagement.views}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-ink-soft">Engagement was not recorded with this claim.</p>
              )}
              <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                {claim.origin === "demo"
                  ? "Demonstration card. Engagement figures, when present, belong to the seed and are not a live embed."
                  : claim.postUrl
                    ? "The original URL is filed. This is not a live embed."
                    : "No public post URL is filed, and this is not a live embed."}
              </p>
              {claim.notes ? <p className="mt-3 text-sm leading-relaxed">{claim.notes}</p> : null}
            </div>
          </section>
          <section>
            <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Evidence</h2>
            {claim.evidence.length === 0 ? (
              <div className="mt-3 border border-dashed border-rule bg-paper px-5 py-8">
                <p className="font-serif text-xl">No evidence card yet.</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  The claim is on the queue. The desk does not invent a source to fill the gap, and it does not draft a verdict from the post alone.
                </p>
                <FindEvidence />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {claim.evidence.map((item) => (
                  <article key={item.id} className="border border-rule bg-paper transition-colors hover:border-ink/25">
                    <div className="flex">
                      <div className={`w-1 shrink-0 ${tierRail[item.tier]}`} />
                      <div className="min-w-0 flex-1 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{item.tier}</p>
                          <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{item.reliability} reliability</p>
                        </div>
                        <h3 className="mt-2 font-serif text-lg leading-snug">{item.organization}</h3>
                        <p className="mt-1 text-sm">{item.title}</p>
                        <p className="mt-1 font-mono text-[11px] text-ink-soft">
                          {item.category} · {item.published}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed">{item.excerpt}</p>
                        <p className="mt-2 font-mono text-[10px] tracking-[0.12em] uppercase text-ink-soft">{item.stance}</p>
                        <p className="mt-3 break-all font-mono text-[11px] text-ink-soft">{item.url ?? "No public URL filed"}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {claim.evidence.length > 0 ? <FindEvidence /> : null}
          </section>
        </div>
        <section>
          <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Related posts</h2>
          {claim.relatedPosts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No related post is filed on this conversation yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {claim.relatedPosts.map((post) => (
                <li key={post.id} className="border border-rule bg-paper px-4 py-3">
                  <p className="font-mono text-[11px] text-ink-soft">@{post.username ?? "account"} · {post.postedAt}</p>
                  <p className="mt-2 text-sm leading-relaxed">{post.text}</p>
                  <a href={post.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline decoration-rule underline-offset-4">
                    Open original post
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="border border-ink bg-paper">
          <header className="border-b border-rule px-5 py-4 sm:px-6">
            <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Fact check</h2>
          </header>
          <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-3">
            <FactColumn title="Supports" items={claim.evidence.filter((item) => item.stance === "supports").map((item) => item.excerpt)} empty="Nothing filed as support." />
            <FactColumn title="Contradicts" items={claim.evidence.filter((item) => item.stance === "contradicts").map((item) => item.excerpt)} empty="Nothing filed as a contradiction." />
            <FactColumn title="Context" items={claim.evidence.filter((item) => item.stance === "contextualizes").map((item) => item.excerpt)} empty="No contextual note is filed." />
          </div>
          <div className="border-t border-rule px-5 py-6 sm:px-6">
            {claim.classification ? (
              <p className="font-serif text-4xl leading-none sm:text-5xl">
                <ClassificationWord value={claim.classification} />
              </p>
            ) : (
              <p className="font-serif text-4xl leading-none text-ink-soft sm:text-5xl">No stamp</p>
            )}
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft">
              {claim.notes || "The status is the editor’s classification. There is no numerical truth score."}
            </p>
            <div className="mt-4 max-w-3xl space-y-2 text-sm leading-relaxed">
              <p>
                <span className="font-mono text-[11px] tracking-[0.12em] text-ink-soft uppercase">Format now </span>
                {claim.format.current}
              </p>
              <p>#CheckAm is a fact-check. #ShowYourWorking is for a calculation the evidence can show. Neither is chosen by the model.</p>
              <p>{claim.format.notTrueReason}</p>
              {claim.hashtag ? <p>Editor’s stored tag: {claim.hashtag}</p> : null}
            </div>
            <div className="mt-5">
              {claim.draftReady ? (
                <Link
                  href={`/drafts?claim=${claim.id}`}
                  className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper transition-colors hover:bg-ink/85"
                >
                  Open draft studio
                </Link>
              ) : (
                <p className="text-sm text-ink-soft">No draft. Research is still open, so the studio will not invent three versions.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

function Brief({ label, body }: { label: string; body: string }) {
  return (
    <div className="border border-rule bg-paper px-4 py-4">
      <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">{label}</h2>
      <p className="mt-2 break-words text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function FactColumn({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="font-serif text-lg">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item} className="text-sm leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
