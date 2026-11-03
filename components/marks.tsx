import Link from "next/link";
import type { DeskMode } from "@/lib/desk/types";
import type { ClaimStatus, Classification, SourceTier, Velocity } from "@/lib/types";
import { cn } from "cn";

const velocityTone: Record<Velocity, string> = {
  Normal: "bg-slateink-soft text-slateink",
  Growing: "bg-forest-soft text-forest",
  Rapid: "bg-amber-soft text-amber",
  Breaking: "bg-stamp-soft text-stamp",
};

const statusTone: Record<ClaimStatus, string> = {
  New: "bg-slateink-soft text-slateink",
  Researching: "bg-amber-soft text-amber",
  Verified: "bg-forest-soft text-forest",
  Contradicted: "bg-stamp-soft text-stamp",
  "Needs Context": "bg-amber-soft text-amber",
  Unverified: "bg-slateink-soft text-slateink",
};

const classTone: Record<Classification, string> = {
  VERIFIED: "text-forest",
  CONTRADICTED: "text-stamp",
  "NEEDS CONTEXT": "text-amber",
  UNVERIFIED: "text-slateink",
};

export const tierRail: Record<SourceTier, string> = {
  "Primary Government Source": "bg-ink",
  "Official Statistics": "bg-slateink",
  "Legislation/Court Record": "bg-forest",
  "Established News Organization": "bg-amber",
  "Independent Fact Checker": "bg-stamp",
  "Other Source": "bg-ink-soft",
};

export function VelocityMark({ value }: { value: Velocity }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase", velocityTone[value])}>
      {value === "Breaking" ? <span className="pulse-dot size-1.5 rounded-full bg-current" /> : null}
      {value}
    </span>
  );
}

export function StatusMark({ value }: { value: ClaimStatus }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase", statusTone[value])}>
      {value}
    </span>
  );
}

export function ClassificationWord({ value }: { value: Classification }) {
  return <span className={cn("font-serif tracking-[-0.03em]", classTone[value])}>{value}</span>;
}

export function SampleNote() {
  return <OriginNote mode="demo" />;
}

export function OriginNote({ mode }: { mode: DeskMode }) {
  if (mode === "live" || mode === "empty") return null;
  const copy =
    mode === "demo"
      ? "Demonstration records. They were loaded by the demo seed. They are not a live scrape and they are not published fact-checks."
      : mode === "mixed"
        ? "Demonstration rows are marked Demo. They are not mixed into live counts without that mark."
        : mode === "unconfigured"
          ? "Supabase is not configured on the server. Sample numbers are not being shown in their place."
          : "The database could not be reached. This screen is not filling the gap with sample numbers.";
  return <p className="border-l-2 border-stamp/80 pl-3 text-[12.5px] leading-relaxed text-ink-soft">{copy}</p>;
}

export function DemoMark() {
  return <span className="font-mono text-[10px] tracking-[0.12em] text-stamp uppercase">Demo</span>;
}

export function EmptyDesk({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-rule bg-paper px-6 py-16 text-center">
      <p className="font-serif text-2xl">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

export function SectionHeading({
  kicker,
  title,
  dek,
}: {
  kicker: string;
  title: string;
  dek?: string;
}) {
  return (
    <header className="max-w-3xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stamp">{kicker}</p>
      <h1 className="mt-2 font-serif text-[2rem] leading-[1.12] tracking-[-0.025em] text-ink sm:text-[2.55rem]">
        {title}
      </h1>
      {dek ? <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{dek}</p> : null}
    </header>
  );
}

export function PaperRule() {
  return (
    <div>
      <div className="h-px w-full bg-ink" />
      <div className="mt-1 h-px w-16 bg-stamp" />
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-stamp">
      {children}
    </Link>
  );
}
