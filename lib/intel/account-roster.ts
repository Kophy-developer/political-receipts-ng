import { engagementQueryLimit, type EngagementSetting, withEngagement } from "@/lib/intel/engagement";
import type { ContentPillar } from "@/lib/pillars/catalog";

export type RosterAccount = {
  handle: string;
  displayName: string;
  pillar: ContentPillar;
  lane: string;
  confidence: "high" | "med";
};

export const rosterEngagement: EngagementSetting = { metric: "replies", minimum: 3 };

const politicsAccounts: RosterAccount[] = [
  { handle: "aonanuga1956", displayName: "Bayo Onanuga", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "OgbeniDipo", displayName: "Dr Dipo Awojide", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "BashirAhmaad", displayName: "Bashir Ahmad", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "Mr_JAGs", displayName: "Jubril A. Gawat", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "woye1", displayName: "Woye", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "dayoisrael", displayName: "Dayo Israel", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "fkeyamo", displayName: "Festus Keyamo", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "AlakeDele", displayName: "Dele Alake", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "renoomokri", displayName: "Reno Omokri", pillar: "politics", lane: "APC", confidence: "high" },
  { handle: "Omojuwa", displayName: "JJ. Omojuwa", pillar: "politics", lane: "APC", confidence: "med" },
  { handle: "PeterObi", displayName: "Peter Obi", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "firstladyship", displayName: "Nefertiti", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "MissPearls", displayName: "Pearls", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "Morris_Monye", displayName: "Morris Monye", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "Jack_ng01", displayName: "JACK The Builder", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "AishaYesufu", displayName: "Aisha Yesufu", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "SavvyRinu", displayName: "Rinu Oduala", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "DavidHundeyin", displayName: "David Hundeyin", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "Tutsy22", displayName: "Adetutu Balogun", pillar: "politics", lane: "Peter Obi", confidence: "high" },
  { handle: "PO_GrassRootM", displayName: "Peter Obi Grassroots Mobilization", pillar: "politics", lane: "Peter Obi", confidence: "med" },
];

const financeAccounts: RosterAccount[] = [
  { handle: "ugodre", displayName: "Ugodre Obi-Chukwu", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "Nairametrics", displayName: "Nairametrics", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "sgyemikale", displayName: "Dr Yemi Kale", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "DrRafiqRaji", displayName: "Dr Rafiq Raji", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "nonso2", displayName: "Nonso Obikili", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "seunonigbinde", displayName: "Olúṣeun Onìgbìndé", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "BudgITng", displayName: "BudgIT", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "MoghaluKingsley", displayName: "Kingsley Moghalu", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "topefasua", displayName: "Tope Kolade Fasua", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "DrJoeAbah", displayName: "Dr Joe Abah", pillar: "finance", lane: "finance", confidence: "high" },
  { handle: "quansimodo", displayName: "Akpifo Onome Ohwovoriole", pillar: "finance", lane: "finance", confidence: "med" },
  { handle: "themoneyafrica", displayName: "Money Africa", pillar: "finance", lane: "finance", confidence: "med" },
  { handle: "FolaFagbule", displayName: "Fola Fagbule", pillar: "finance", lane: "finance", confidence: "med" },
  { handle: "Statisense", displayName: "Statisense", pillar: "finance", lane: "finance", confidence: "med" },
  { handle: "cenbank", displayName: "Central Bank of Nigeria", pillar: "finance", lane: "finance", confidence: "high" },
];

const manchesterAccounts: RosterAccount[] = [
  { handle: "ManUtd", displayName: "Manchester United", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "UnitedStandMUFC", displayName: "The United Stand", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "UtdDistrict", displayName: "UtdDistrict", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "utdreport", displayName: "utdreport", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "UtdPlug", displayName: "UtdPlug", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "mufcMPB", displayName: "mufcmpb", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "ManUtdMEN", displayName: "Man United News (MEN)", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "ManUnitedZone", displayName: "United Zone", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "centredevils", displayName: "centredevils.", pillar: "manchester_united", lane: "Man U", confidence: "high" },
  { handle: "lauriewhitwell", displayName: "Laurie Whitwell", pillar: "manchester_united", lane: "Man U", confidence: "high" },
];

export const accountRoster: Record<ContentPillar, RosterAccount[]> = {
  politics: politicsAccounts,
  finance: financeAccounts,
  manchester_united: manchesterAccounts,
};

export const allRosterAccounts: RosterAccount[] = [
  ...politicsAccounts,
  ...financeAccounts,
  ...manchesterAccounts,
];

export function normalizeHandle(value: string) {
  return value.replace(/^@/, "").trim();
}

export function rosterHandles(pillar: ContentPillar) {
  return accountRoster[pillar].map((account) => account.handle);
}

export function fromClause(handle: string) {
  const clean = normalizeHandle(handle);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(clean)) {
    throw new Error(`Roster handle is not a valid X username: ${handle}`);
  }
  return `from:${clean}`;
}

export type RosterBatch = {
  pillar: ContentPillar;
  handles: string[];
  topicQuery: string;
  requestQuery: string;
  operator: string;
};

export function buildRosterBatches(
  pillar: ContentPillar,
  setting: EngagementSetting = rosterEngagement,
  limit = engagementQueryLimit,
): { ok: true; batches: RosterBatch[] } | { ok: false; message: string; dropped: string[] } {
  const handles = rosterHandles(pillar);
  if (handles.length === 0) return { ok: true, batches: [] };
  const batches: RosterBatch[] = [];
  let current: string[] = [];

  const flush = (group: string[]) => {
    if (group.length === 0) return null as string | null;
    const topicQuery = `(${group.map(fromClause).join(" OR ")}) -is:retweet`;
    const built = withEngagement(topicQuery, setting);
    if (!built.ok) return built.message;
    if (built.query.length > limit) return "The completed X query is too long. No X request was made.";
    batches.push({
      pillar,
      handles: group,
      topicQuery,
      requestQuery: built.query,
      operator: built.operator,
    });
    return null;
  };

  for (const handle of handles) {
    const trial = [...current, handle];
    const topicQuery = `(${trial.map(fromClause).join(" OR ")}) -is:retweet`;
    const built = withEngagement(topicQuery, setting);
    if (!built.ok || built.query.length > limit) {
      if (current.length === 0) {
        return { ok: false, message: `Handle @${handle} cannot fit in one X search query with the engagement operator.`, dropped: [handle] };
      }
      const problem = flush(current);
      if (problem) return { ok: false, message: problem, dropped: current };
      current = [handle];
      const alone = flush([handle]);
      if (alone) return { ok: false, message: alone, dropped: [handle] };
      current = [];
      continue;
    }
    current = trial;
  }
  if (current.length > 0) {
    const problem = flush(current);
    if (problem) return { ok: false, message: problem, dropped: current };
  }

  const covered = new Set(batches.flatMap((batch) => batch.handles.map((handle) => handle.toLowerCase())));
  const dropped = handles.filter((handle) => !covered.has(handle.toLowerCase()));
  if (dropped.length > 0) {
    return { ok: false, message: `Roster search would omit ${dropped.length} handle(s). No X request was made.`, dropped };
  }
  return { ok: true, batches };
}

export function rosterCoverage(pillars: ContentPillar[] = ["politics", "finance", "manchester_united"]) {
  const accounts = pillars.flatMap((pillar) => accountRoster[pillar]);
  return {
    accounts: accounts.length,
    handles: accounts.map((account) => account.handle),
    byPillar: Object.fromEntries(pillars.map((pillar) => [pillar, accountRoster[pillar].length])) as Record<ContentPillar, number>,
  };
}
