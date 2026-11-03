import Link from "next/link";
import { PageFrame } from "@/components/shell/page-frame";

export default function ClaimNotFound() {
  return (
    <PageFrame>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">CLAIM</p>
      <h1 className="mt-3 font-serif text-4xl tracking-[-0.03em]">This claim is not on the desk.</h1>
      <Link href="/claims" className="mt-6 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper">
        Return to claims
      </Link>
    </PageFrame>
  );
}
