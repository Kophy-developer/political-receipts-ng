"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { editor } from "@/lib/system";
import { isActive, navItems } from "@/lib/nav";
import { cn } from "cn";
import { ReceiptMark } from "@/components/shell/mark";
import { DeskClock } from "@/components/shell/desk-clock";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="block px-4 pb-2 pt-5">
        <span className="flex items-start gap-2.5">
          <ReceiptMark className="mt-0.5 size-8 shrink-0 text-[#f3efe6]" />
          <span>
            <span className="block font-serif text-[15px] leading-tight tracking-[-0.01em] text-[#f6f3ec]">
              Political Receipts
            </span>
            <span className="mt-1 block font-mono text-[10px] tracking-[0.18em] text-white/45">
              NG · PRNG
            </span>
          </span>
        </span>
        <span className="mt-3 block font-serif text-[13px] italic leading-snug text-white/55">
          Politics. Claims. Receipts.
        </span>
      </Link>
      <nav className="mt-4 flex-1 px-2" aria-label="Desk">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-[#d9d3c7] transition-colors hover:bg-white/10 hover:text-white",
                    active && "bg-white/10 text-white",
                  )}
                >
                  {active ? (
                    <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 bg-stamp" />
                  ) : null}
                  <Icon className="size-4 shrink-0 opacity-80" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto border-t border-white/10 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.16em] text-white/40">SYSTEM STATUS</p>
        <ul className="mt-2 space-y-1.5 text-xs text-[#d9d3c7]">
          <li className="flex items-center justify-between">
            <span>Desk</span>
            <span className="inline-flex items-center gap-1.5 text-[#b7dfc8]">
              <span className="pulse-dot size-1.5 rounded-full bg-[#7dcea0]" />
              Live
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>X</span>
            <span className="text-white/55">Not verified</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Gemini</span>
            <span className="text-white/55">Not configured</span>
          </li>
        </ul>
        <DeskClock tone="ink" />
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 font-mono text-[11px] text-[#f3efe6]">
            {editor.initials}
          </span>
          <span>
            <span className="block text-sm text-[#f6f3ec]">{editor.name}</span>
            <span className="block text-xs text-white/50">
              {editor.role} · {editor.desk}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
