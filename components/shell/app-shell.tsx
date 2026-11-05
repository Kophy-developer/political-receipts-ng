import { Suspense } from "react";
import { connection } from "next/server";
import { geminiLabel } from "@/lib/ai/env";
import { MobileBar } from "@/components/shell/mobile-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { loadEditorIdentity } from "@/lib/db/identity";
import { defaultEditorIdentity, type EditorIdentity } from "@/lib/identity";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Shell identity={defaultEditorIdentity}>{children}</Shell>}>
      <LoadedShell>{children}</LoadedShell>
    </Suspense>
  );
}

async function LoadedShell({ children }: { children: React.ReactNode }) {
  await connection();
  const identity = await loadEditorIdentity();
  return <Shell identity={identity}>{children}</Shell>;
}

function Shell({ identity, children }: { identity: EditorIdentity; children: React.ReactNode }) {
  return (
    <div className="min-h-full lg:flex">
      <a
        href="#desk"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to desk
      </a>
      <Sidebar identity={identity} />
      <div className="min-w-0 flex-1">
        <MobileBar gemini={geminiLabel()} identity={identity} />
        <main id="desk">{children}</main>
      </div>
    </div>
  );
}
