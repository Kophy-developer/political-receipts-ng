import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ApprovalQueue } from "@/components/publisher/queue";
import { ReadyNotify } from "@/components/publisher/ready-banner";
import { PageFrame } from "@/components/shell/page-frame";
import { listUnreadReadyNotifications } from "@/lib/db/notifications";
import { listReadyForApproval } from "@/lib/db/publisher";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Approve" };

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ApproveHome />
    </Suspense>
  );
}

async function ApproveHome() {
  await connection();
  const [queue, unread] = await Promise.all([listReadyForApproval(), listUnreadReadyNotifications()]);
  return (
    <PageFrame className="max-w-3xl">
      <ReadyNotify initialCount={unread.count} markOnView />
      <ApprovalQueue items={queue.items} notice={queue.notice.message} />
    </PageFrame>
  );
}
