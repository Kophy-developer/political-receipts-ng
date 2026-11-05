import "server-only";
import { xScopes } from "@/lib/x/public";
import { encryptSecret, encryptionReady } from "@/lib/db/crypto";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { editorActor } from "@/lib/db/identity";
import { capabilityForSubscription, type SubscriptionType } from "@/lib/publish/capability";

export async function saveOauth2Connection(input: {
  xUserId: string;
  username: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  subscriptionType?: SubscriptionType | null;
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
        ...(input.subscriptionType !== undefined
          ? { subscription_type: input.subscriptionType, subscription_checked_at: new Date().toISOString() }
          : {}),
      },
      { onConflict: "x_user_id" },
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, reason: "database" as const, message: scrubDbMessage(error?.message || "upsert") };
  await recordEvent({
    action: "X connection changed",
    actor: await editorActor(),
    subjectType: "x_connection",
    subjectId: data.id,
    detail: { username: input.username, status: "connected" },
  });
  return { ok: true as const, id: data.id as string };
}

export async function recordAccountProfile(input: {
  xUserId: string;
  username: string;
  displayName: string;
  subscriptionType: SubscriptionType | null;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const checkedAt = new Date().toISOString();
  const fields = {
    username: input.username,
    display_name: input.displayName,
    subscription_type: input.subscriptionType,
    subscription_checked_at: checkedAt,
    last_verified_at: checkedAt,
    updated_at: checkedAt,
  };
  const existing = await db.from("x_connections").select("id").eq("x_user_id", input.xUserId).maybeSingle();
  if (existing.error) {
    if (columnMissing(existing.error.message)) return { ok: false as const, message: "Subscription storage is not installed yet." };
    return { ok: false as const, message: scrubDbMessage(existing.error.message) };
  }
  if (existing.data?.id) {
    const updated = await db.from("x_connections").update(fields).eq("id", existing.data.id).select("id").maybeSingle();
    if (updated.error || !updated.data) return { ok: false as const, message: scrubDbMessage(updated.error?.message || "profile") };
    await recordEvent({
      action: "X connection changed",
      actor: await editorActor(),
      subjectType: "x_connection",
      subjectId: updated.data.id,
      detail: { username: input.username, status: "profile", subscription: input.subscriptionType },
    });
    return { ok: true as const, checkedAt };
  }
  const inserted = await db
    .from("x_connections")
    .insert({ ...fields, x_user_id: input.xUserId, status: "disconnected", scopes: [] })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) return { ok: false as const, message: scrubDbMessage(inserted.error?.message || "profile") };
  await recordEvent({
    action: "X connection changed",
    actor: await editorActor(),
    subjectType: "x_connection",
    subjectId: inserted.data.id,
    detail: { username: input.username, status: "profile", subscription: input.subscriptionType },
  });
  return { ok: true as const, checkedAt };
}

export async function latestConnection() {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("x_connections")
    .select("username, display_name, status, last_verified_at, subscription_type, subscription_checked_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && columnMissing(error.message)) {
    const fallback = await db
      .from("x_connections")
      .select("username, display_name, status, last_verified_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return {
      username: fallback.data.username as string,
      displayName: fallback.data.display_name as string,
      status: fallback.data.status as string,
      lastVerified: fallback.data.last_verified_at as string | null,
      subscriptionType: null,
      subscriptionCheckedAt: null,
    };
  }
  if (error || !data) return null;
  return {
    username: data.username as string,
    displayName: data.display_name as string,
    status: data.status as string,
    lastVerified: data.last_verified_at as string | null,
    subscriptionType: typeof data.subscription_type === "string" ? data.subscription_type : null,
    subscriptionCheckedAt: (data.subscription_checked_at as string | null) ?? null,
  };
}

export async function loadStoredCapability() {
  const connection = await latestConnection();
  return capabilityForSubscription({
    subscription: connection?.subscriptionType ?? null,
    checkedAt: connection?.subscriptionCheckedAt ?? null,
  });
}
