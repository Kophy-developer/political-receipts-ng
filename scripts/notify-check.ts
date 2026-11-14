import { readFileSync } from "node:fs";
import { browserNotifyBody, browserNotifyTitle, readyBanner } from "../lib/publisher/notify";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

check("banner names one or many drafts", readyBanner(0) === null && readyBanner(1) === "1 new draft is ready for approval." && /2 new drafts/.test(readyBanner(2) || ""));
check("browser copy stays off email vendors", browserNotifyTitle(1).includes("Political Receipts") && browserNotifyBody(2).includes("Approve") && !browserNotifyBody(1).includes("@"));

const migration = readFileSync(new URL("../supabase/migrations/20261114120000_publisher_notifications.sql", import.meta.url), "utf8");
check("migration creates publisher_notifications", /create table if not exists public\.publisher_notifications/.test(migration));
check("migration notifies on READY_FOR_EDITOR", /READY_FOR_EDITOR/.test(migration) && /notify_ready_for_editor/.test(migration));
check("migration enables realtime when publication exists", /supabase_realtime/.test(migration) && /alter publication/.test(migration));
check("migration allows anon select only", /grant select on table public\.publisher_notifications to anon/.test(migration) && /revoke all on table public\.publisher_notifications from anon, authenticated/.test(migration));

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const banner = readFileSync(new URL("../components/publisher/ready-banner.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/publisher/notifications/route.ts", import.meta.url), "utf8");
const develop = readFileSync(new URL("../lib/db/develop.ts", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

check("home shows the ready banner and marks read on view", home.includes("ReadyNotify") && home.includes("markOnView") && home.includes("listUnreadReadyNotifications"));
check("banner can use Supabase Realtime and the Notification API", banner.includes("publisher_notifications") && banner.includes("Notification") && banner.includes("postgres_changes"));
check("mark-read writes require same-origin", route.includes("assertEditorRequest") && route.includes("markReadyNotificationsRead"));
check("develop records a ready notification", develop.includes("recordReadyNotification"));
check("readme documents in-app notify without mail vendors", /Ready notifications \(no email vendor\)/.test(readme) && /no Resend, SendGrid, Postmark/.test(readme));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("notify checks passed");
