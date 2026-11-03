import "server-only";
import { xScopes } from "@/lib/x/public";
import { encryptSecret, encryptionReady } from "@/lib/db/crypto";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { editor } from "@/lib/system";

export async function saveOauth2Connection(input: {
  xUserId: string;
  username: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  if (!encryptionReady()) return { ok: false as const, reason: "encrypt" as const };
  const access = encryptSecret(input.accessToken);
  const refresh = encryptSecret(input.refreshToken);
  if (!access || !refresh) return { ok: false as const, reason: "encrypt" as const };
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "database" as const };
  const expires = new Date(Date.now() + Math.max(0, input.expiresIn) * 1000).toISOString();
  const { data, error } = await db
    .from("x_connections")
    .upsert(
      {
        x_user_id: input.xUserId,
        username: input.username,
        display_name: input.displayName,
        scopes: [...xScopes],
        access_token_encrypted: access,
        refresh_token_encrypted: refresh,
        token_expires_at: expires,
        status: "connected",
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "x_user_id" },
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, reason: "database" as const, message: scrubDbMessage(error?.message || "upsert") };
  await recordEvent({
    action: "X connection changed",
    actor: editor.name,
    subjectType: "x_connection",
    subjectId: data.id,
    detail: { username: input.username, status: "connected" },
  });
  return { ok: true as const, id: data.id as string };
}

export async function markConnectionVerified(username: string) {
  const db = serviceClient();
  if (!db) return;
  const { data } = await db
    .from("x_connections")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("username", username)
    .select("id");
  if (!data?.length) return;
  await recordEvent({
    action: "X connection changed",
    actor: editor.name,
    subjectType: "x_connection",
    subjectId: data[0].id,
    detail: { username, status: "verified" },
  });
}

export async function latestConnection() {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("x_connections")
    .select("username, display_name, status, last_verified_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    username: data.username as string,
    displayName: data.display_name as string,
    status: data.status as string,
    lastVerified: data.last_verified_at as string | null,
  };
}
