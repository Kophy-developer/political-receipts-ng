import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { claims } from "../lib/claims";
import { conversations } from "../lib/conversations";
import { draftPackages } from "../lib/drafts";
import type { ClaimStatus } from "../lib/types";

if (process.env.SEED_DEMO !== "1") {
  console.error("Refusing to seed. Set SEED_DEMO=1 when you mean to load demonstration rows.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("The seed needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Do not paste the service role key into chat.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const statusMap: Record<ClaimStatus, string> = {
  New: "new",
  Researching: "researching",
  Verified: "verified",
  Contradicted: "contradicted",
  "Needs Context": "needs_context",
  Unverified: "unverified",
};

function slug(value: string) {
  const next = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return next.slice(0, 80) || "item";
}

function hash(text: string) {
  return createHash("sha256").update(text).digest("base64url");
}

function count(text: string) {
  return Array.from(text).length;
}

function stamp(value: string) {
  const parsed = new Date(value.replace("·", "").replace("WAT", "GMT+0100"));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function stanceFor(status: ClaimStatus) {
  if (status === "Contradicted") return "contradicts";
  if (status === "Verified") return "supports";
  return "contextualizes";
}

async function run(label: string, promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function main() {
  await run("clear evidence", db.from("evidence").delete().eq("origin", "demo"));
  await run("clear drafts", db.from("drafts").delete().eq("origin", "demo"));
  await run("clear claims", db.from("claims").delete().eq("origin", "demo"));
  await run("clear sources", db.from("sources").delete().eq("origin", "demo"));
  await run("clear conversations", db.from("conversations").delete().eq("origin", "demo"));
  await run("clear topics", db.from("topics").delete().eq("origin", "demo"));
  await run("clear entities", db.from("political_entities").delete().eq("origin", "demo"));

  const topicIds = new Map<string, string>();
  for (const conversation of conversations) {
    const topicSlug = slug(conversation.topic);
    const inserted = await db.from("topics").insert({ name: conversation.topic, slug: topicSlug, origin: "demo" }).select("id").single();
    if (inserted.error || !inserted.data) throw new Error(`topic ${conversation.topic}: ${inserted.error?.message}`);
    topicIds.set(conversation.id, inserted.data.id);
  }

  const conversationIds = new Map<string, string>();
  for (const conversation of conversations) {
    const inserted = await db
      .from("conversations")
      .insert({
        topic_id: topicIds.get(conversation.id),
        title: conversation.topic,
        summary: conversation.summary,
        narrative: conversation.narrative,
        started_at: stamp(conversation.firstDetected),
        engagement: {
          volume: conversation.volume,
          growthPct: conversation.growthPct,
          velocity: conversation.velocity,
          velocityNote: conversation.velocityNote,
        },
        desk_note: conversation.deskNote,
        origin: "demo",
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) throw new Error(`conversation ${conversation.topic}: ${inserted.error?.message}`);
    conversationIds.set(conversation.id, inserted.data.id);
    for (const name of conversation.entities) {
      const entitySlug = `${slug(name)}-${conversation.id}`;
      const entity = await db.from("political_entities").insert({ name, slug: entitySlug, kind: "other", origin: "demo" }).select("id").single();
      if (entity.error || !entity.data) throw new Error(`entity ${name}: ${entity.error?.message}`);
      await run(
        "conversation entity",
        db.from("conversation_entities").insert({ conversation_id: inserted.data.id, entity_id: entity.data.id }),
      );
    }
  }

  const claimIds = new Map<string, string>();
  for (const claim of claims) {
    const inserted = await db
      .from("claims")
      .insert({
        conversation_id: conversationIds.get(claim.topicId) ?? null,
        topic_id: topicIds.get(claim.topicId) ?? null,
        claim_text: claim.claim,
        original_author: claim.speaker,
        original_author_username: claim.handle.replace(/^@/, ""),
        original_author_role: claim.role,
        original_post_text: claim.postText,
        detected_at: stamp(claim.postedAt),
        engagement: { ...claim.engagement, virality: claim.virality },
        status: statusMap[claim.status],
        editor_notes: claim.factCheck.note,
        suggested_hashtag: claim.factCheck.hashtag,
        origin: "demo",
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) throw new Error(`claim ${claim.id}: ${inserted.error?.message}`);
    claimIds.set(claim.id, inserted.data.id);
    await run(
      "claim event",
      db.from("system_events").insert({
        action: "claim created",
        actor: "demo seed",
        subject_type: "claim",
        subject_id: inserted.data.id,
        detail: { origin: "demo" },
      }),
    );
    for (const card of claim.evidence) {
      const source = await db
        .from("sources")
        .insert({
          organization: card.organization,
          title: card.title,
          url: card.urlPlaceholder.startsWith("https://") ? card.urlPlaceholder : null,
          published_label: card.published,
          category: card.tier,
          reliability: card.reliability.toLowerCase(),
          retrieved_at: new Date().toISOString(),
          origin: "demo",
        })
        .select("id")
        .single();
      if (source.error || !source.data) throw new Error(`source ${card.title}: ${source.error?.message}`);
      const evidence = await db
        .from("evidence")
        .insert({
          claim_id: inserted.data.id,
          source_id: source.data.id,
          excerpt: card.excerpt,
          stance: stanceFor(claim.status),
          origin: "demo",
        })
        .select("id")
        .single();
      if (evidence.error || !evidence.data) throw new Error(`evidence ${card.id}: ${evidence.error?.message}`);
      await run(
        "evidence event",
        db.from("system_events").insert({
          action: "evidence added",
          actor: "demo seed",
          subject_type: "evidence",
          subject_id: evidence.data.id,
          detail: { origin: "demo", stance: stanceFor(claim.status) },
        }),
      );
    }
  }

  const styles = { A: "straight", B: "conversational", C: "strong_hook" } as const;
  for (const pack of draftPackages) {
    const claimId = claimIds.get(pack.claimId);
    if (!claimId) continue;
    for (const version of pack.versions) {
      const inserted = await db
        .from("drafts")
        .insert({
          claim_id: claimId,
          version: version.id,
          content: version.text,
          content_hash: hash(version.text),
          style: styles[version.id],
          suggested_hashtag: version.hashtag,
          character_count: count(version.text),
          generation_metadata: { seeded: true, holdReason: pack.holdReason },
          status: pack.ready ? "ready" : "held",
          origin: "demo",
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) throw new Error(`draft ${pack.claimId} ${version.id}: ${inserted.error?.message}`);
      await run(
        "draft event",
        db.from("system_events").insert({
          action: "draft generated",
          actor: "demo seed",
          subject_type: "draft",
          subject_id: inserted.data.id,
          detail: { origin: "demo", version: version.id },
        }),
      );
    }
  }

  console.log(`Seeded ${claims.length} demonstration claims, ${conversations.length} conversations, and ${draftPackages.length} draft packages. No X post was created.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "The seed failed.";
  console.error(message.replace(/bearer|token|secret|service_role|eyJ[A-Za-z0-9_-]+/gi, "[redacted]"));
  process.exit(1);
});
