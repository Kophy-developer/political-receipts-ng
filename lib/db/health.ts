import "server-only";
import type { SystemHealth } from "@/lib/desk/types";
import { schemaMissing } from "@/lib/db/client";
import { encryptionReady } from "@/lib/db/crypto";
import { latestConnection } from "@/lib/db/connections";
import { geminiLabel } from "@/lib/ai/env";
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
  "search_groups",
  "x_posts",
  "scan_runs",
  "api_usage",
  "ai_analyses",
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
    ai: geminiLabel(),
    monitoring: "Manual only",
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return base;
  const probes = await Promise.all(
    tables.map(async (table) => {
      try {
        const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
          cache: "no-store",
        });
        if (response.ok) return { table, missing: false, failed: false };
        const body = await response.text();
        const missing = response.status === 404 || schemaMissing(body);
        return { table, missing, failed: !missing };
      } catch {
        return { table, missing: false, failed: true };
      }
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
