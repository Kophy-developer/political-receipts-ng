import "server-only";
import { fileRetrievedEvidence, storeVerdict } from "@/lib/db/research";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { serviceClient } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";
import { lagosDayStart } from "@/lib/intel/limits";
import { fetchDocument } from "@/lib/research/fetch-document";
import { researchLimits } from "@/lib/research/limits";
import { sourceCategories, tierForHost } from "@/lib/research/plan";
import type { Pillar, StatementKind } from "@/lib/research/types";

export async function addManualSource(claimId: string, rawUrl: string) {
  if (!isUuid(claimId)) return { ok: false as const, message: "That claim is not on the desk." };
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const claim = await db.from("claims").select("id, content_pillar, statement_kind").eq("id", claimId).maybeSingle();
  if (claim.error || !claim.data) return { ok: false as const, message: "That claim is not on the desk." };
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, message: "Document usage could not be read. Nothing was retrieved." };
  if (usage.totals.retrievals >= researchLimits.dailyRetrievals) {
    return { ok: false as const, message: "The daily document limit is reached. Nothing was retrieved." };
  }
  const page = await fetchDocument(rawUrl);
  if (page.attempted) await recordUsage({ provider: "retrieval", operation: "manual_document", requests: 1, units: page.ok ? 1 : 0 });
  if (!page.ok) return { ok: false as const, message: page.message };
  const pillar: Pillar = claim.data.content_pillar === "football" || claim.data.content_pillar === "finance" ? claim.data.content_pillar : "politics";
  const kind: StatementKind = claim.data.statement_kind === "opinion" || claim.data.statement_kind === "analysis" ? claim.data.statement_kind : "fact";
  const tier = tierForHost(page.domain, await sourceCategories(pillar));
  const filed = await fileRetrievedEvidence({
    claimId,
    pillar,
    url: page.url,
    domain: page.domain,
    title: page.title,
    organization: page.domain,
    published: page.published,
    passage: page.passage,
    pageLabel: page.pageLabel,
    tierRank: tier.rank,
    tierName: tier.name,
    notes: "Pasted by the editor. The passage is stored as context until someone accepts a reading of it.",
  });
  if (!filed.ok) return filed;
  await storeVerdict(claimId, kind);
  return { ok: true as const, message: "The page was retrieved. It is not a verdict until you accept it." };
}
