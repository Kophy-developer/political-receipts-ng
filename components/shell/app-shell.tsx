import { MobileBar } from "@/components/shell/mobile-bar";
import { Sidebar } from "@/components/shell/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full lg:flex">
      <a
        href="#desk"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to desk
      </a>
      <Sidebar />
      <div className="min-w-0 flex-1">
        <MobileBar />
        <main id="desk">{children}</main>
      </div>
    </div>
  );
}
