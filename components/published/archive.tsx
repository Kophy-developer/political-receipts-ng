"use client";

import { useMemo, useState } from "react";
import type { DeskMode, DeskPost } from "@/lib/desk/types";
import type { Hashtag } from "@/lib/types";
import { PageFrame } from "@/components/shell/page-frame";
import { ClassificationWord, DemoMark, EmptyDesk, OriginNote, SectionHeading } from "@/components/marks";
import { cn } from "cn";

const filters: Array<"All" | Hashtag> = ["All", "#CheckAm", "#ShowYourWorking", "#NotTrue"];

export function Archive({ posts, mode }: { posts: DeskPost[]; mode: DeskMode }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const visible = useMemo(
    () => posts.filter((post) => filter === "All" || post.hashtag === filter),
    [filter, posts],
  );

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Published"
          title="What a person already cleared"
          dek="A post appears here only after the server records a confirmed publish. The sample archive is not shown as if it had been sent."
        />
        <OriginNote mode={mode} />
        <div className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase",
                filter === item ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-soft hover:border-ink/30",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        {posts.length === 0 ? (
          <EmptyDesk title="No posts recorded" body="Nothing has been published from this desk. Approving a draft still requires a person, and this page does not invent a history." />
        ) : visible.length === 0 ? (
          <div className="border border-dashed border-rule bg-paper px-6 py-16 text-center">
            <p className="font-serif text-2xl">No posts in this format.</p>
          </div>
        ) : (
          <div className="border border-rule bg-paper">
            {visible.map((post) => (
              <details key={post.id} className="group border-b border-rule last:border-b-0">
                <summary className="cursor-pointer list-none px-4 py-4 hover:bg-[#f6f1e8] sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px]">{post.hashtag ?? "No hashtag"}</span>
                    {post.classification ? (
                      <span className="font-serif text-lg leading-none">
                        <ClassificationWord value={post.classification} />
                      </span>
                    ) : null}
                    {post.origin === "demo" ? <DemoMark /> : null}
                    <span className="font-mono text-[11px] text-ink-soft">{post.publishedAt}</span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed">{post.text}</p>
                  <p className="mt-3 font-mono text-[11px] text-ink-soft">No real performance data yet</p>
                </summary>
                <div className="grid gap-3 border-t border-rule px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
                  <Meta label="Topic" value={post.topic} />
                  <Meta label="Style" value={post.style ?? "Not recorded"} />
                  <Meta label="Record" value={post.origin === "demo" ? "Demonstration" : "Live"} />
                  <Meta label="Account" value={post.account} />
                  <Meta label="Post" value={post.url ?? "URL not stored"} />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
