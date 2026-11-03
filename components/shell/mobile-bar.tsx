"use client";

import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ReceiptMark } from "@/components/shell/mark";
import { SidebarNav } from "@/components/shell/sidebar-nav";

export function MobileBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2">
        <ReceiptMark className="size-7 text-ink" />
        <div>
          <p className="font-serif text-sm leading-none text-ink">Political Receipts</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-ink-soft">NG</p>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="outline" size="icon" aria-label="Open menu" />}
        >
          <Menu />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[86vw] max-w-[320px] border-white/10 bg-sidebar p-0 text-sidebar-foreground sm:max-w-[320px]"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Suspense fallback={null}>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </Suspense>
        </SheetContent>
      </Sheet>
    </header>
  );
}
