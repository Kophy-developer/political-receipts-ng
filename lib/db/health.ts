import "server-only";
import type { SystemHealth } from "@/lib/desk/types";
import { schemaMissing, serviceClient } from "@/lib/db/client";
import { encryptionReady } from "@/lib/db/crypto";
import { latestConnection } from "@/lib/db/connections";
import { credentialFlags } from "@/lib/x/env";

const tables = [
  "editor_profiles",
  "x_connections",
  "political_entities",
  "topics",
  "conversations",
  "claims",
  "sources",
  "evidence",
  "drafts",
  "editorial_reviews",
  "publish_approvals",
  "published_posts",
  "post_metrics",
  "system_events",
];

export async function systemHealth(): Promise<SystemHealth> {
  const flags = credentialFlags();
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const base: SystemHealth = {
    supabaseConfigured,
    databaseReachable: false,
    schema: "unknown",
    missingTables: [],
    xCredentials: flags.configured,
    xOauth2: flags.oauth2,
    xOauth1: flags.oauth1,
    encryptionKey: encryptionReady(),
    xAccount: { status: "Not verified", username: null, displayName: null, lastVerified: null },
    ai: "Not integrated",
    monitoring: "Not started",
  };
  const db = serviceClient();
  if (!db) return base;
  const probes = await Promise.all(
    tables.map(async (table) => {
      const { error } = await db.from(table).select("id", { head: true, count: "exact" });
      return { table, missing: Boolean(error && schemaMissing(error.message)), failed: Boolean(error && !schemaMissing(error.message)) };
    }),
  );
  const missing = probes.filter((probe) => probe.missing).map((probe) => probe.table);
  const failed = probes.some((probe) => probe.failed);
  base.databaseReachable = !failed;
  base.schema = !failed && missing.length === 0 ? "present" : missing.length ? "missing" : "unknown";
  base.missingTables = missing;
  if (base.schema === "present") {
    const connection = await latestConnection();
    if (connection) {
      base.xAccount = {
        status: connection.status === "connected" ? "Stored" : connection.status,
        username: connection.username,
        displayName: connection.displayName,
        lastVerified: connection.lastVerified,
      };
    }
  }
  return base;
}
