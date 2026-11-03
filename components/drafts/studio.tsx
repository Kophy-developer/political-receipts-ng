"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, RotateCcw } from "lucide-react";
import { claims } from "@/lib/claims";
import { packageFor } from "@/lib/drafts";
import { characterCount, POST_LIMIT } from "@/lib/format";
import { checklist, editor } from "@/lib/system";
import type { DraftVersion, VersionId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PageFrame } from "@/components/shell/page-frame";
import { ClassificationWord, SampleNote, SectionHeading, StatusMark } from "@/components/marks";
import { cn } from "cn";

const slots = ["Tomorrow · 07:30 WAT", "Tomorrow · 12:15 WAT", "Tomorrow · 18:40 WAT"];
const rejectReasons = [
  "Evidence too thin",
  "Tone overclaims",
  "Needs a named source",
  "Duplicate",
  "Other",
];

interface PackageState {
  selected: VersionId | null;
  texts: Record<VersionId, string>;
  regen: Record<VersionId, number>;
  checks: Record<string, boolean>;
  editing: VersionId | null;
  draftEdit: string;
  savedAt: string | null;
  heldSlot: string | null;
  rejectedReason: string | null;
  approvalNoted: boolean;
  copied: VersionId | null;
  notice: string | null;
}

function blankChecks() {
  return Object.fromEntries(checklist.map((item) => [item.id, false]));
}

function initialState(versions: DraftVersion[]): PackageState {
  const texts = { A: "", B: "", C: "" };
  const regen = { A: 0, B: 0, C: 0 };
  for (const version of versions) texts[version.id] = version.text;
  return {
    selected: null,
    texts,
    regen,
    checks: blankChecks(),
    editing: null,
    draftEdit: "",
    savedAt: null,
    heldSlot: null,
    rejectedReason: null,
    approvalNoted: false,
    copied: null,
    notice: null,
  };
}

export function DraftStudio() {
  const params = useSearchParams();
  const router = useRouter();
  const drafted = claims.filter((claim) => packageFor(claim.id));
  const requested = params.get("claim");
  const fallback = drafted.find((claim) => packageFor(claim.id)?.ready)?.id ?? drafted[0]?.id ?? claims[0].id;
  const activeId = claims.some((claim) => claim.id === requested) ? requested! : fallback;
  const [states, setStates] = useState<Record<string, PackageState>>({});
  const [approveOpen, setApproveOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectChoice, setRejectChoice] = useState(rejectReasons[0]);

  const claim = claims.find((item) => item.id === activeId) ?? claims[0];
  const pack = packageFor(claim.id);
  const state = states[claim.id] ?? (pack ? initialState(pack.versions) : null);

  function patch(next: Partial<PackageState>) {
    if (!pack || !state) return;
    setStates((current) => ({
      ...current,
      [claim.id]: { ...(current[claim.id] ?? state), ...next },
    }));
  }

  function chooseClaim(id: string) {
    router.replace(`/drafts?claim=${id}`, { scroll: false });
  }

  const selectedVersion = pack?.versions.find((version) => version.id === state?.selected) ?? null;
  const selectedText = state && state.selected ? state.texts[state.selected] : "";
  const selectedCount = characterCount(selectedText);
  const checksDone = state ? checklist.filter((item) => state.checks[item.id]).length : 0;
  const allChecked = checksDone === checklist.length;
  const canApprove = Boolean(
    pack?.ready &&
      state?.selected &&
      allChecked &&
      selectedCount > 0 &&
      selectedCount <= POST_LIMIT &&
      !state.rejectedReason,
  );

  const ordered = useMemo(() => {
    return [...claims].sort((a, b) => {
      const aPack = packageFor(a.id);
      const bPack = packageFor(b.id);
      const rank = (item: typeof aPack) => (item?.ready ? 0 : item ? 1 : 2);
      return rank(aPack) - rank(bPack);
    });
  }, []);

  async function copyVersion(id: VersionId, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      patch({ copied: id, notice: "Copied to the clipboard. Nothing was sent." });
    } catch {
      patch({ notice: "The browser blocked clipboard access." });
    }
  }

  function regenerate(version: DraftVersion) {
    if (!state) return;
    const pool = [version.text, ...version.alternates];
    const nextIndex = (state.regen[version.id] + 1) % pool.length;
    patch({
      texts: { ...state.texts, [version.id]: pool[nextIndex] },
      regen: { ...state.regen, [version.id]: nextIndex },
      checks: blankChecks(),
      approvalNoted: false,
      selected: state.selected,
      notice: "Regenerated from the sample alternatives. The checklist was reset because the text changed.",
    });
  }

  function selectVersion(id: VersionId) {
    if (!state || !pack?.ready) return;
    const count = characterCount(state.texts[id]);
    if (count > POST_LIMIT) {
      patch({ notice: `Version ${id} is over ${POST_LIMIT} characters. Shorten it before selecting.` });
      return;
    }
    patch({ selected: id, notice: null });
  }

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Draft generator"
          title="Three ways to say what the evidence allows"
          dek="Version A is straight. Version B is conversational. Version C is built to travel on X without leaving the record. Selecting a version does not publish it."
        />
        <SampleNote />
        <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border border-rule bg-paper lg:sticky lg:top-6">
            <p className="border-b border-rule px-4 py-3 font-mono text-[10px] tracking-[0.16em] uppercase">Queue</p>
            <ul className="max-h-[70vh] overflow-auto">
              {ordered.map((item) => {
                const itemPack = packageFor(item.id);
                const active = item.id === claim.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => chooseClaim(item.id)}
                      className={cn(
                        "w-full border-b border-rule px-4 py-3 text-left transition-colors hover:bg-[#f6f1e8]",
                        active && "bg-[#f6f1e8]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] tracking-[0.12em]">{item.id.toUpperCase()}</span>
                        <QueueBadge ready={itemPack?.ready ?? null} drafted={Boolean(itemPack)} />
                      </span>
                      <span className="mt-1 block text-sm leading-snug">{item.claim}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div className="min-w-0">
            <div className="border border-rule bg-paper px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[10px] tracking-[0.14em]">{claim.id.toUpperCase()}</p>
                <StatusMark value={claim.status} />
                {claim.factCheck.classification ? (
                  <span className="font-serif text-lg leading-none">
                    <ClassificationWord value={claim.factCheck.classification} />
                  </span>
                ) : null}
              </div>
              <p className="mt-3 font-serif text-2xl leading-snug tracking-[-0.02em]">{claim.claim}</p>
              <p className="mt-2 text-sm text-ink-soft">
                {claim.handle} · {claim.topic}
                {claim.confidence !== null ? ` · confidence ${claim.confidence}` : ""}
              </p>
              <Link href={`/claims/${claim.id}`} className="mt-3 inline-block text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
                Open the dossier
              </Link>
            </div>
            {!pack || !state ? (
              <div className="mt-4 border border-dashed border-rule bg-paper px-5 py-10">
                <p className="font-serif text-2xl">No draft on this claim.</p>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
                  {claim.factCheck.note} The studio does not generate a post until there is an evidence pack and a classification, including a classification of unverified.
                </p>
              </div>
            ) : (
              <>
                {pack.holdReason ? (
                  <p className="mt-4 border border-amber/40 bg-amber-soft px-4 py-3 text-sm leading-relaxed text-amber">
                    Held. {pack.holdReason}
                  </p>
                ) : null}
                {state.notice ? <p className="mt-4 text-sm text-ink-soft">{state.notice}</p> : null}
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  {pack.versions.map((version) => {
                    const text = state.texts[version.id];
                    const count = characterCount(text);
                    const over = count > POST_LIMIT;
                    const selected = state.selected === version.id;
                    const editing = state.editing === version.id;
                    return (
                      <article
                        key={version.id}
                        className={cn(
                          "flex flex-col border bg-paper transition-colors",
                          selected ? "border-stamp" : "border-rule hover:border-ink/30",
                        )}
                      >
                        <header className="border-b border-rule px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-[10px] tracking-[0.16em] uppercase">{version.label}</p>
                              <p className="mt-1 font-serif text-lg leading-tight">{version.intent}</p>
                            </div>
                            {selected ? (
                              <span className="font-mono text-[10px] tracking-[0.14em] text-stamp uppercase">Selected</span>
                            ) : null}
                          </div>
                        </header>
                        <div className="flex flex-1 flex-col px-4 py-4">
                          {editing ? (
                            <Textarea
                              value={state.draftEdit}
                              onChange={(event) => patch({ draftEdit: event.target.value })}
                              className="min-h-56 rounded-none border-rule bg-[#f6f1e8] text-[15px] leading-relaxed"
                            />
                          ) : (
                            <p className="whitespace-pre-wrap font-serif text-[15.5px] leading-relaxed">{text}</p>
                          )}
                          <dl className="mt-4 space-y-1.5 border-t border-rule pt-3 font-mono text-[11px] text-ink-soft">
                            <div className="flex justify-between gap-3">
                              <dt>Characters</dt>
                              <dd className={cn("tabular-nums", over ? "text-stamp" : "text-ink")}>
                                {count} / {POST_LIMIT}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Hashtag</dt>
                              <dd className="text-ink">{version.hashtag}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Confidence</dt>
                              <dd className="text-ink">{version.confidence}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Risk</dt>
                              <dd className={riskClass(version.risk)}>{version.risk}</dd>
                            </div>
                          </dl>
                          <p className="mt-2 text-xs leading-relaxed text-ink-soft">{version.riskNote}</p>
                          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                            Sources: {claim.evidence.length === 0 ? "None attached" : claim.evidence.map((item) => item.organization).join(" · ")}
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {editing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    const changed = state.draftEdit !== text;
                                    patch({
                                      editing: null,
                                      texts: { ...state.texts, [version.id]: state.draftEdit },
                                      checks: changed ? blankChecks() : state.checks,
                                      approvalNoted: changed ? false : state.approvalNoted,
                                      notice: changed ? "Edit kept on this desk. Checklist reset." : "No change.",
                                    });
                                  }}
                                >
                                  Save edit
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => patch({ editing: null })}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button type="button" variant="outline" onClick={() => patch({ editing: version.id, draftEdit: text })}>
                                  Edit
                                </Button>
                                <Button type="button" variant="outline" onClick={() => copyVersion(version.id, text)}>
                                  {state.copied === version.id ? <Check /> : <Copy />}
                                  {state.copied === version.id ? "Copied" : "Copy"}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => regenerate(version)}>
                                  <RotateCcw />
                                  Regenerate
                                </Button>
                                <Button
                                  type="button"
                                  variant={selected ? "default" : "outline"}
                                  disabled={!pack.ready || Boolean(state.rejectedReason)}
                                  onClick={() => selectVersion(version.id)}
                                >
                                  Select
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {state.selected && selectedVersion ? (
                  <section className="mt-5 border border-ink bg-paper">
                    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-4 py-4 sm:px-5">
                      <div>
                        <p className="font-mono text-[10px] tracking-[0.16em] uppercase">Pre-publication checklist</p>
                        <h2 className="mt-1 font-serif text-2xl">Before any approval</h2>
                      </div>
                      <p className="font-mono text-xs tabular-nums">
                        {checksDone} of {checklist.length}
                      </p>
                    </header>
                    <ul className="divide-y divide-rule">
                      {checklist.map((item) => (
                        <li key={item.id}>
                          <label className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-[#f6f1e8] sm:px-5">
                            <Checkbox
                              checked={state.checks[item.id]}
                              onCheckedChange={(checked) =>
                                patch({
                                  checks: { ...state.checks, [item.id]: checked },
                                  approvalNoted: false,
                                })
                              }
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block text-sm">{item.label}</span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{item.detail}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-3 border-t border-rule px-4 py-4 sm:px-5">
                      <p className="text-sm leading-relaxed text-ink-soft">
                        {selectedCount > POST_LIMIT
                          ? `Bring Version ${state.selected} within ${POST_LIMIT} characters before approval.`
                          : canApprove
                            ? `Version ${state.selected} is ready for a human decision. Approval still will not post.`
                            : "The approve button stays closed until every line is checked."}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          type="button"
                          disabled={!canApprove}
                          className="h-11 bg-stamp text-[#f8f1ee] hover:bg-[#8a261b]"
                          onClick={() => setApproveOpen(true)}
                        >
                          Approve & post to X
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() =>
                            patch({
                              savedAt: "Saved in this browser session",
                              notice: "Draft saved on this desk. It lives in this session only. Nothing was sent.",
                            })
                          }
                        >
                          Save draft
                        </Button>
                        <Button type="button" variant="outline" className="h-11" onClick={() => setScheduleOpen(true)}>
                          Schedule later
                        </Button>
                        <Button type="button" variant="ghost" className="h-11 text-stamp hover:text-stamp" onClick={() => setRejectOpen(true)}>
                          Reject
                        </Button>
                      </div>
                      {state.savedAt ? <p className="text-xs text-ink-soft">{state.savedAt}</p> : null}
                      {state.heldSlot ? (
                        <p className="text-xs text-ink-soft">Held for {state.heldSlot}. Not sent.</p>
                      ) : null}
                      {state.rejectedReason ? (
                        <p className="text-sm text-stamp">
                          Rejected on this desk: {state.rejectedReason}.{" "}
                          <button type="button" className="underline" onClick={() => patch({ rejectedReason: null })}>
                            Undo
                          </button>
                        </p>
                      ) : null}
                      {state.approvalNoted ? (
                        <p className="text-sm">
                          Approval noted by {editor.name}. X was not contacted. The draft is still on the desk.
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : (
                  <p className="mt-4 text-sm text-ink-soft">
                    Select a version to open the checklist and the approval controls.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">This will not post</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              X integration has not been connected yet. This draft would be published after X authentication is configured.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-rule bg-[#f6f1e8] px-3 py-3">
            <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
              Version {state?.selected} · would-be post
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{selectedText}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => {
                patch({ approvalNoted: true, notice: "Held for X. No request left this browser." });
                setApproveOpen(false);
              }}
            >
              Note the approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Schedule is a hold</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              Choosing a slot does not send the post. When X is connected, a person will still have to approve the release.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {slots.map((slot) => (
              <Button
                key={slot}
                type="button"
                variant="outline"
                className="h-10 justify-start"
                onClick={() => {
                  patch({ heldSlot: slot, notice: `Held for ${slot}. Nothing was sent.` });
                  setScheduleOpen(false);
                }}
              >
                {slot}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Reject this package</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              Rejection stays on this desk. It does not notify X, and it can be undone in the session.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {rejectReasons.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setRejectChoice(reason)}
                className={cn(
                  "border px-3 py-2 text-left text-sm",
                  rejectChoice === reason ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink/30",
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-stamp text-[#f8f1ee] hover:bg-[#8a261b]"
              onClick={() => {
                patch({
                  rejectedReason: rejectChoice,
                  selected: null,
                  approvalNoted: false,
                  notice: "Package rejected on this desk.",
                });
                setRejectOpen(false);
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function QueueBadge({ ready, drafted }: { ready: boolean | null; drafted: boolean }) {
  if (!drafted) return <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">No draft</span>;
  if (ready) return <span className="font-mono text-[10px] tracking-[0.12em] text-forest uppercase">Ready</span>;
  return <span className="font-mono text-[10px] tracking-[0.12em] text-amber uppercase">Held</span>;
}

function riskClass(risk: "Low" | "Moderate" | "Elevated") {
  if (risk === "Low") return "text-forest";
  if (risk === "Moderate") return "text-amber";
  return "text-stamp";
}
