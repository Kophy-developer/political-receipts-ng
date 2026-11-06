import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/shell/page-frame";
import { libraryNav } from "@/lib/nav";

export const metadata: Metadata = { title: "Archive" };

const extra = [
  { href: "/analytics", label: "Analytics" },
  { href: "/desk", label: "Desk" },
];

export default function ArchivePage() {
  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Archive</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Older records stay available.</h1>
      <p className="mt-3 text-sm text-ink-soft">Intelligence, claims, opportunities, sources, and drafts are unchanged. Their addresses still open.</p>
      <ul className="mt-6 space-y-2">
        {[...libraryNav, ...extra].map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="inline-flex h-11 items-center underline text-sm">{item.label}</Link>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
