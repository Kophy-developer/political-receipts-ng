import Link from "next/link";
import { PageFrame } from "@/components/shell/page-frame";

export default function NotFound() {
  return (
    <PageFrame>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">404</p>
      <h1 className="mt-3 font-serif text-4xl tracking-[-0.03em]">This page is not on the desk.</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        The route does not match a briefing, a claim, or a setting. The sample workspace has not moved it.
      </p>
      <Link href="/" className="mt-6 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper">
        Return to overview
      </Link>
    </PageFrame>
  );
}
