"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
import type { DeskMode, StudioClaim, StudioPackage } from "@/lib/desk/types";
import { characterCount, POST_LIMIT } from "@/lib/format";
import { checklist, editor } from "@/lib/system";
import type { VersionId } from "@/lib/types";
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
import { ClassificationWord, DemoMark, EmptyDesk, OriginNote, SectionHeading, StatusMark } from "@/components/marks";
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
  checks: Record<string, boolean>;
  editing: VersionId | null;
  draftEdit: string;
  savedAt: string | null;
  heldSlot: string | null;
  rejectedReason: string | null;
  approvalNoted: boolean;
  approvalId: string | null;
  copied: VersionId | null;
  notice: string | null;
}

function blankChecks() {
  return Object.fromEntries(checklist.map((item) => [item.id, false]));
}

function initialState(versions: StudioPackage["versions"]): PackageState {
  const texts = { A: "", B: "", C: "" } as Record<VersionId, string>;
  for (const version of versions) texts[version.id] = version.text;
  return {
    selected: null,
    texts,
    checks: blankChecks(),
    editing: null,
    draftEdit: "",
    savedAt: null,
    heldSlot: null,
    rejectedReason: null,
    approvalNoted: false,
    approvalId: null,
    copied: null,
    notice: null,
  };
}

export function DraftStudio({ claims, packages, mode }: { claims: StudioClaim[]; packages: StudioPackage[]; mode: DeskMode }) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("claim");
  const fallback = packages.find((item) => item.ready)?.claimId ?? packages[0]?.claimId ?? claims[0]?.id ?? "";
  const activeId = claims.some((claim) => claim.id === requested) ? requested! : fallback;
  const [states, setStates] = useState<Record<string, PackageState>>({});
  const [approveOpen, setApproveOpen] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [intentReady, setIntentReady] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ claimId: string; id: string; url: string; retained: boolean } | null>(null);
  const postLock = useRef(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectChoice, setRejectChoice] = useState(rejectReasons[0]);

  const claim = claims.find((item) => item.id === activeId) ?? null;
  const pack = packages.find((item) => item.claimId === claim?.id) ?? null;
  const state = claim ? (states[claim.id] ?? (pack ? initialState(pack.versions) : null)) : null;

  function patch(next: Partial<PackageState>) {
    if (!claim || !pack || !state) return;
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
      const aPack = packages.find((item) => item.claimId === a.id);
      const bPack = packages.find((item) => item.claimId === b.id);
      const rank = (item: StudioPackage | undefined) => (item?.ready ? 0 : item ? 1 : 2);
      return rank(aPack) - rank(bPack);
    });
  }, [claims, packages]);

  async function copyVersion(id: VersionId, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      patch({ copied: id, notice: "Copied to the clipboard. Nothing was sent." });
    } catch {
      patch({ notice: "The browser blocked clipboard access." });
    }
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

  async function readBody(response: Response) {
    try {
      return (await response.json()) as { ok?: boolean; message?: string; id?: string; url?: string; approvalId?: string; retained?: boolean };
    } catch {
      return {};
    }
  }

  async function openApprove() {
    if (!claim || !state || !selectedVersion) return;
    setApproveOpen(true);
    setConfirmPost(false);
    setIntentReady(false);
    setPublishError(null);
    setPosted(null);
    try {
      const response = await fetch("/api/x/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: selectedText, claimId: claim.id, draftId: selectedVersion?.draftId, checks: state.checks }),
      });
      const data = await readBody(response);
      if (!response.ok || !data.ok || !data.approvalId) {
        setPublishError((data.message || "The desk could not open a publish ticket.").slice(0, 180));
        return;
      }
      setIntentReady(true);
      patch({ approvalId: data.approvalId });
    } catch {
      setPublishError("The desk could not open a publish ticket.");
    }
  }

  async function confirmPublish() {
    if (postLock.current || !claim || !state || !confirmPost || !intentReady || !state.approvalId) return;
    postLock.current = true;
    setPosting(true);
    setPublishError(null);
    try {
      const response = await fetch("/api/x/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: selectedText,
          claimId: claim.id,
          draftId: selectedVersion?.draftId,
          approvalId: state.approvalId,
          checks: state.checks,
          confirm: true,
        }),
      });
      const data = await readBody(response);
      if (!response.ok || !data.ok || !data.id || !data.url || !/^https:\/\/x\.com\/i\/web\/status\/\d+$/.test(data.url)) {
        setPublishError((data.message || "X did not accept the post. Check the account before trying again.").slice(0, 180));
        return;
      }
      setPosted({ claimId: claim.id, id: data.id, url: data.url, retained: data.retained === true });
      patch({
        approvalNoted: true,
        notice: data.retained
          ? "Sent to X. The post id is stored with this approval."
          : "Sent to X. The id is on screen, but the database did not confirm the row.",
      });
    } catch {
      setPublishError("The desk could not reach the publish route. Check X before trying again.");
    } finally {
      postLock.current = false;
      setPosting(false);
    }
  }

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-6">
        <SectionHeading
          kicker="Draft generator"
          title="Three ways to say what the evidence allows"
          dek="Version A is straight. Version B is conversational. Version C is built to travel on X without leaving the record. Selecting a version does not publish it."
        />
        <OriginNote mode={mode} />
        {claims.length === 0 ? (
          <EmptyDesk title="No drafts filed" body="The studio is empty. Demonstration drafts stay in the seed until someone loads them, and Gemini has not been asked to write any." />
        ) : null}
        {claim ? <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border border-rule bg-paper lg:sticky lg:top-6">
            <p className="border-b border-rule px-4 py-3 font-mono text-[10px] tracking-[0.16em] uppercase">Queue</p>
            <ul className="max-h-[70vh] overflow-auto">
              {ordered.map((item) => {
                const itemPack = packages.find((entry) => entry.claimId === item.id);
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
                <p className="font-mono text-[10px] tracking-[0.14em]">{claim.origin === "demo" ? <DemoMark /> : "Filed"}</p>
                <StatusMark value={claim.status} />
                {claim.classification ? (
                  <span className="font-serif text-lg leading-none">
                    <ClassificationWord value={claim.classification} />
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
                  {claim.note} Gemini is not connected, so the studio will not invent a version.
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
                              <dt>Style</dt>
                              <dd className="text-ink">{version.style}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Status</dt>
                              <dd className="text-ink">{version.editorModified ? "Edited" : version.status}</dd>
                            </div>
                          </dl>
                          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                            Sources: {claim.evidenceOrgs.length === 0 ? "None attached" : claim.evidenceOrgs.join(" · ")}
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {editing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    void (async () => {
                                      const changed = state.draftEdit !== text;
                                      if (!changed) {
                                        patch({ editing: null, notice: "No change." });
                                        return;
                                      }
                                      const response = await fetch("/api/desk/drafts", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({ draftId: version.draftId, content: state.draftEdit }),
                                      });
                                      const data = await readBody(response);
                                      if (!response.ok || !data.ok) {
                                        patch({ notice: (data.message || "The edit was not stored.").slice(0, 180) });
                                        return;
                                      }
                                      patch({
                                        editing: null,
                                        texts: { ...state.texts, [version.id]: state.draftEdit },
                                        checks: blankChecks(),
                                        approvalNoted: false,
                                        approvalId: null,
                                        notice: "Edit stored. Any approval of the previous text was invalidated.",
                                      });
                                      setIntentReady(false);
                                    })();
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
                                <Button type="button" variant="outline" disabled>
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
                            ? `Version ${state.selected} is ready for a human decision. X is called only after the final confirmation.`
                            : "The approve button stays closed until every line is checked."}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          type="button"
                          disabled={!canApprove}
                          className="h-11 bg-stamp text-[#f8f1ee] hover:bg-[#8a261b]"
                          onClick={() => {
                            void openApprove();
                          }}
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
                      {posted && posted.claimId === claim.id ? (
                        <p className="text-sm">
                          Posted by {editor.name}. X id {posted.id}. {posted.retained ? "The id is stored with the approval." : "The database did not confirm the row."}{" "}
                          <a href={posted.url} className="underline" target="_blank" rel="noreferrer">
                            Open the post
                          </a>
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
        </div> : null}
      </div>
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Final confirmation</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              This is the only step that sends text to X. The checklist is checked again on the server. Closing this window sends nothing.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-rule bg-[#f6f1e8] px-3 py-3">
            <p className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
              Version {state?.selected} · exact text
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{selectedText}</p>
          </div>
          <label className="flex items-start gap-3 text-sm leading-relaxed">
            <Checkbox checked={confirmPost} onCheckedChange={(checked) => setConfirmPost(checked)} className="mt-0.5" disabled={Boolean(posted) || posting} />
            <span>Post this exact text to X. I have read it and I am sending it on purpose.</span>
          </label>
          {publishError ? <p className="text-sm text-stamp">{publishError}</p> : null}
          {posted ? (
            <p className="text-sm">
              X accepted the post. Id {posted.id}. {posted.retained ? "It is stored with this approval." : "The database did not confirm the row."}{" "}
              <a href={posted.url} className="underline" target="_blank" rel="noreferrer">
                Open it
              </a>
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)} disabled={posting}>
              Keep editing
            </Button>
            <Button
              type="button"
              disabled={!confirmPost || !intentReady || posting || Boolean(posted)}
              className="bg-stamp text-[#f8f1ee] hover:bg-[#8a261b]"
              onClick={() => {
                void confirmPublish();
              }}
            >
              {posting ? "Sending…" : "Post to X"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Schedule is a hold</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              Choosing a slot does not send the post. A person still has to confirm the text before anything reaches X.
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

