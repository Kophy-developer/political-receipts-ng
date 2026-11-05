import { Suspense } from "react";
import { geminiLabel } from "@/lib/ai/env";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import type { EditorIdentity } from "@/lib/identity";

function RailFallback() {
  return <div className="h-full bg-sidebar" />;
}

export function Sidebar({ identity }: { identity: EditorIdentity }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <Suspense fallback={<RailFallback />}>
        <SidebarNav gemini={geminiLabel()} identity={identity} />
      </Suspense>
    </aside>
  );
}
