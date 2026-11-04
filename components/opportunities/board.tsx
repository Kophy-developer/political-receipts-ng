"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OpportunityCard } from "@/lib/opportunities/types";
import { PageFrame } from "@/components/shell/page-frame";
import { SectionHeading } from "@/components/marks";

const typeLabel: Record<string, string> = {
  reaction: "Reaction",
  opinion: "Opinion",
  check: "Check",
  analysis: "Analysis",
  original_insight: "Original insight",
  humour: "Humour",
  question: "Question",
};

const scoreLabel: Record<string, string> = {
  high: "High opportunity",
  medium: "Medium opportunity",
  low: "Low opportunity",
};

const researchLabel: Record<string, string> = {
  yes: "Research: yes",
  recommended: "Research: recommended",
  no: "Research: no",
};

type Review = { conversation_id?: string; model_status?: string; rules_status?: string; note?: string };
type Conversation = { id: string; title: string; status: string };

export function OpportunitiesBoard({
  items,
  reviews,
  conversations,
  unavailable,
}: {
  items: OpportunityCard[];
  reviews: Review[];
  conversations: Conversation[];
  unavailable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const modelUnavailable = reviews.some((review) => review.model_status === "unavailable") || items.length === 0;

  const counts = useMemo(() => {
    const types: Record<string, number> = {};
    const scores = { high: 0, medium: 0, low: 0 };
    const research = { yes: 0, recommended: 0, no: 0 };
    for (const item of items) {
      types[item.type] = (types[item.type] ?? 0) + 1;
      if (item.score === "high" || item.score === "medium" || item.score === "low") scores[item.score] += 1;
      if (item.research === "yes" || item.research === "recommended" || item.research === "no") research[item.research] += 1;
    }
    return { types, scores, research };
  }, [items]);

  async function post(path: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(payload.message || (payload.ok ? "Saved." : "That did not save."));
      if (payload.ok) router.refresh();
    } catch {
      setMessage("The desk could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Opportunities"
          title="Is there something worth saying?"
          dek="X finds the conversation. This page asks whether you have something to add. It does not write your view, and it does not post."
        />
        <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
          Live intelligence, then this desk, then research only when a card needs it, then a draft you approve. Claims stay available for the factual work.
        </p>
        {modelUnavailable ? (
          <div className="border border-stamp bg-paper px-4 py-4">
            <p className="font-serif text-2xl">Opportunity analysis unavailable</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed">
              The model was not called. A missing model answer is not “no opportunity.” Cards below, if any, come from desk rules or from a note you filed yourself.
            </p>
          </div>
        ) : null}
        {unavailable ? <p className="text-sm">The opportunity tables could not be read.</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => post("/api/opportunities/review", {}, "review")}
            className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            {busy === "review" ? "Reading stored posts…" : "Review stored posts"}
          </button>
          <p className="max-w-xl self-center text-sm text-ink-soft">Uses posts already on the desk. It does not call X, and it does not search the web.</p>
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label="High / medium / low" value={`${counts.scores.high} / ${counts.scores.medium} / ${counts.scores.low}`} />
          <Stat label="Research yes / recommended / no" value={`${counts.research.yes} / ${counts.research.recommended} / ${counts.research.no}`} />
          <Stat label="Open cards" value={String(items.filter((item) => item.status !== "ignored").length)} />
        </dl>
        <p className="font-mono text-[11px] tracking-[0.12em] text-ink-soft uppercase">
          {Object.entries(typeLabel).map(([key, label]) => `${label} ${counts.types[key] ?? 0}`).join(" · ")}
        </p>
        <ManualForm conversations={conversations} busy={busy} onSubmit={(body) => post("/api/opportunities", body, "manual")} />
        {items.length === 0 ? (
          <div className="border border-dashed border-rule bg-paper px-5 py-8">
            <p className="font-serif text-xl">No opportunity cards yet.</p>
            <p className="mt-2 text-sm text-ink-soft">Review the stored posts, or file a card yourself. An empty list is not a model saying there is nothing to say.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <Card key={item.id} item={item} busy={busy} onPost={post} />
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule bg-paper px-3 py-3">
      <dt className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function Card({
  item,
  busy,
  onPost,
}: {
  item: OpportunityCard;
  busy: string | null;
  onPost: (path: string, body: Record<string, unknown>, key: string) => Promise<void>;
}) {
  const [take, setTake] = useState("");
  const [angle, setAngle] = useState(item.angles[0]?.title ?? "");
  const [open, setOpen] = useState(false);
  return (
    <article className="border border-rule bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-ink px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-paper uppercase">{scoreLabel[item.score] ?? item.score}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{typeLabel[item.type] ?? item.type}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{researchLabel[item.research] ?? item.research}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{item.voice}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{item.source}</span>
      </div>
      {item.conversationTitle ? <p className="mt-3 text-sm text-ink-soft">{item.conversationTitle}</p> : null}
      <dl className="mt-4 grid gap-4">
        <div>
          <dt className="font-mono text-[10px] tracking-[0.14em] uppercase">What happened?</dt>
          <dd className="mt-1 text-sm leading-relaxed">{item.whatHappened}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.14em] uppercase">Why is it interesting?</dt>
          <dd className="mt-1 text-sm leading-relaxed">{item.whyInteresting}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.14em] uppercase">What could I add?</dt>
          <dd className="mt-1 text-sm leading-relaxed">{item.whatCouldAdd}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.14em] uppercase">Do I need research?</dt>
          <dd className="mt-1 text-sm leading-relaxed">
            {item.research === "yes" ? "Yes. A factual sentence is doing the work." : item.research === "recommended" ? "Recommended. There may be a fact inside the view." : "No. Do not invent a citation for this."}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{item.scoreReason}</p>
      {item.angles.length > 0 ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {item.angles.map((angleItem) => (
            <li key={angleItem.title} className="border border-rule px-3 py-3">
              <p className="font-serif text-lg leading-snug">{angleItem.title}</p>
              <p className="mt-2 text-sm leading-relaxed">{angleItem.note}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {item.editorTake ? <p className="mt-4 text-sm leading-relaxed">Your take: {item.editorTake}</p> : null}
      {item.claimId ? (
        <Link href={`/claims/${item.claimId}`} className="mt-4 inline-block text-sm underline decoration-rule underline-offset-4">
          Open the dossier. Research has not been started from this card.
        </Link>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => setOpen((value) => !value)} className="inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50">
          Talk about this
        </button>
        <button type="button" disabled={busy !== null} onClick={() => onPost("/api/opportunities/decision", { id: item.id, action: "research", angle }, item.id)} className="inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50">
          {item.research === "no" ? "Research first" : "Send to research"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => onPost("/api/opportunities/decision", { id: item.id, action: "save" }, item.id)} className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50">
          Save for later
        </button>
        <button type="button" disabled={busy !== null} onClick={() => onPost("/api/opportunities/decision", { id: item.id, action: "ignore" }, item.id)} className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50">
          Ignore
        </button>
      </div>
      {open ? (
        <form
          className="mt-4 grid gap-3 border-t border-rule pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            onPost("/api/opportunities/decision", { id: item.id, action: "talk", angle, take }, item.id);
          }}
        >
          {item.angles.length > 0 ? (
            <label className="text-sm">
              Angle
              <select value={angle} onChange={(event) => setAngle(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
                <option value="">I’ll write my own</option>
                {item.angles.map((angleItem) => (
                  <option key={angleItem.title} value={angleItem.title}>
                    {angleItem.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-sm">
            My take
            <textarea value={take} onChange={(event) => setTake(event.target.value)} rows={3} placeholder="I think people are missing the real issue here..." className="mt-1 w-full border border-rule px-3 py-2 outline-none focus:border-ink" />
          </label>
          <button type="submit" disabled={busy !== null} className="inline-flex h-10 w-fit items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
            Keep my take
          </button>
        </form>
      ) : null}
    </article>
  );
}

function ManualForm({
  conversations,
  busy,
  onSubmit,
}: {
  conversations: Conversation[];
  busy: string | null;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [type, setType] = useState("question");
  const [research, setResearch] = useState("no");
  const [score, setScore] = useState("low");
  const [whatHappened, setWhatHappened] = useState("");
  const [whyInteresting, setWhyInteresting] = useState("");
  const [whatCouldAdd, setWhatCouldAdd] = useState("");
  return (
    <div className="border border-rule bg-paper">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl">File one yourself</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">Use this when the model is down, or when the rules missed a line you actually want to talk about.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex h-10 items-center border border-ink px-4 text-sm">
          {open ? "Close" : "New opportunity"}
        </button>
      </div>
      {open ? (
        <form
          className="grid gap-3 border-t border-rule px-4 py-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ conversationId, type, research, score, whatHappened, whyInteresting, whatCouldAdd, pillar: "politics" });
          }}
        >
          <label className="text-sm sm:col-span-2">
            Conversation
            <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
              <option value="">None</option>
              {conversations.filter((item) => item.status !== "closed").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title.slice(0, 90)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Type
            <select value={type} onChange={(event) => setType(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
              {Object.entries(typeLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Research
            <select value={research} onChange={(event) => setResearch(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
              <option value="no">No</option>
              <option value="recommended">Recommended</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label className="text-sm">
            Score
            <select value={score} onChange={(event) => setScore(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            What happened?
            <textarea required value={whatHappened} onChange={(event) => setWhatHappened(event.target.value)} rows={2} className="mt-1 w-full border border-rule px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            Why is it interesting?
            <textarea required value={whyInteresting} onChange={(event) => setWhyInteresting(event.target.value)} rows={2} className="mt-1 w-full border border-rule px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            What could I add?
            <textarea required value={whatCouldAdd} onChange={(event) => setWhatCouldAdd(event.target.value)} rows={2} className="mt-1 w-full border border-rule px-3 py-2" />
          </label>
          <button type="submit" disabled={busy !== null} className="inline-flex h-10 w-fit items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
            File opportunity
          </button>
        </form>
      ) : null}
    </div>
  );
}
