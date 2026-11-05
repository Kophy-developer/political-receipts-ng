import { geminiLabel } from "@/lib/ai/env";
import { MobileBar } from "@/components/shell/mobile-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { loadEditorIdentity } from "@/lib/db/identity";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const identity = await loadEditorIdentity();
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
