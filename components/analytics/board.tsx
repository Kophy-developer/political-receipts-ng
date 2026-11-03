import type { DeskMode } from "@/lib/desk/types";
import { PageFrame } from "@/components/shell/page-frame";
import { EmptyDesk, OriginNote, SectionHeading } from "@/components/marks";

export function AnalyticsBoard({ mode, readings }: { mode: DeskMode; readings: number }) {
  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <SectionHeading
          kicker="Analytics"
          title="No real performance data yet"
          dek="Impressions, engagement, and follower counts are not computed from demonstration posts. This page stays empty until post metrics are stored."
        />
        <OriginNote mode={mode} />
        <EmptyDesk
          title={readings > 0 ? `${readings} metric reading${readings === 1 ? "" : "s"} on file` : "Nothing to chart"}
          body={
            readings > 0
              ? "Readings exist, and this desk does not turn them into a ranked story until an editor asks for that view. No rate on this page is invented."
              : "Automated collection has not started. A published post does not invent impressions."
          }
        />
      </div>
    </PageFrame>
  );
}
