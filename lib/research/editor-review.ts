export const POLLING_UNIT_CLAIM_ID = "82eaadd5-423c-470c-97e8-04138598b727";

export type ReviewFindingLabel = "SUPPORTED BY AVAILABLE REPORTING" | "NOT ESTABLISHED" | "UNKNOWN";

export type ReviewSourceKind = "primary record" | "independent reporting" | "original allegation";

export type ReviewAngleId = "receipts" | "serious" | "trust" | "own";

export type EditorReviewSource = {
  group: string;
  kind: ReviewSourceKind;
  label: string;
  title: string;
  url: string;
  note: string;
};

export type EditorReviewPacket = {
  proposedVerdict: "NEEDS CONTEXT";
  explanation: string;
  confidence: "moderate";
  findings: Array<{ label: ReviewFindingLabel; text: string }>;
  angles: Array<{ id: Exclude<ReviewAngleId, "own">; title: string; points: string[] }>;
  sources: EditorReviewSource[];
  formatRecommendation: "#CheckAm";
  formatNote: string;
  followUpNote: string;
  notTrueNote: string;
};

export type RecordedSource = {
  kind: ReviewSourceKind;
  label: string;
  url: string;
};

export const proposalColumns = [
  "proposed_verdict",
  "verdict_reasoning",
  "verdict_caveats",
  "verdict_unknown",
  "verdict_confidence",
  "attribution_note",
  "editor_review",
  "format_recommendation",
] as const;

export const acceptanceColumns = [
  "status",
  "verification_confidence",
  "verdict_confidence",
  "verdict_recorded_at",
  "verdict_recorded_by",
  "verdict_evidence_used",
] as const;

export const angleColumns = ["editor_angle", "editor_angle_text", "editor_take"] as const;

const untouched = ["original_post_text", "original_post_url", "original_post_id", "status", "verdict_recorded_at"];

export function reviewColumnsLeaveThePostAlone(columns: readonly string[]) {
  return columns.every((column) => !untouched.includes(column) && !column.startsWith("original_"));
}

export const pollingUnitReview: EditorReviewPacket = {
  proposedVerdict: "NEEDS CONTEXT",
  explanation:
    "Credible reporting supports the existence of suspected AI-generated photographs in INEC's preliminary voter register. INEC publicly responded to that controversy. The research found no authoritative record or credible independent reporting supporting the separate claim that INEC created 453 polling units for AI-generated voters. Therefore the entire post should not simply be labelled false.",
  confidence: "moderate",
  findings: [
    {
      label: "SUPPORTED BY AVAILABLE REPORTING",
      text: "Suspected AI-generated photographs appeared in the preliminary voter register and INEC publicly addressed the irregularities.",
    },
    {
      label: "NOT ESTABLISHED",
      text: "INEC created 453 polling units for AI-generated voters.",
    },
    {
      label: "NOT ESTABLISHED",
      text: "The alleged 453 polling units were connected to the AI-photograph controversy.",
    },
    {
      label: "UNKNOWN",
      text: "Where the number 453 originated.",
    },
  ],
  angles: [
    {
      id: "receipts",
      title: "Receipts",
      points: [
        "The AI-photo controversy is real.",
        "The 453-polling-unit claim is not established by the records we found.",
      ],
    },
    {
      id: "serious",
      title: "The real story is already serious",
      points: [
        "Suspected AI-generated photographs appearing in a preliminary voter register is serious enough to investigate.",
        "There is no need to attach an unsupported 453-polling-unit claim to make the story concerning.",
      ],
    },
    {
      id: "trust",
      title: "Trust / information",
      points: [
        "A real controversy can become harder to understand when additional unsupported details get attached to it.",
        "Separate what INEC acknowledged from what social media claims.",
      ],
    },
  ],
  sources: [
    {
      group: "INEC primary records",
      kind: "primary record",
      label: "INEC polling-unit page",
      title: "Polling units",
      url: "https://inecnigeria.org/polling-units",
      note: "Primary record. The page records 119,973 polling units established in 1996, later expanded and converted to 176,846. It does not record 453 new units, and it does not mention AI-generated voters.",
    },
    {
      group: "INEC primary records",
      kind: "primary record",
      label: "Electoral Act 2022",
      title: "Electoral Act 2022",
      url: "https://inecnigeria.org/documents/Electoral-Act-2022.pdf",
      note: "Primary record. The Act tells the Commission to establish an adequate number of polling units in each ward. No filed passage states a figure of 453. Readable page text was not extracted from the stored PDF.",
    },
    {
      group: "BBC reporting",
      kind: "independent reporting",
      label: "BBC News Pidgin",
      title: "Inec AI-generated images",
      url: "https://www.bbc.com/pidgin/articles/c6gelpr1qq29o",
      note: "Independent reporting. Published Friday, Oct 30, 2026, 8:39 a.m. CT. INEC explains suspected AI-generated images and other irregularities in the preliminary register released online. The report does not mention 453 polling units.",
    },
    {
      group: "Daily Trust reporting",
      kind: "independent reporting",
      label: "Daily Trust",
      title: "This isn't the final certified copy",
      url: "https://dailytrust.com/this-isnt-the-final-certified-copy-inec-reacts-to-alleged-ai-generated-photographs-on-voters-register/",
      note: "Independent reporting. Published Tuesday, Oct 27, 2026, 3:10 p.m. CT. Mohammed Haruna says photographs from a polling unit in Etsako West, Edo, were suspected to be AI-generated, and that the online preliminary register is not the final certified copy. The report does not mention 453 polling units.",
    },
    {
      group: "Original X allegation",
      kind: "original allegation",
      label: "@ClassicEchelon",
      title: "The allegation under review",
      url: "https://x.com/ClassicEchelon/status/2117896758088941615",
      note: "Original allegation. The post says INEC created 453 polling units for AI-created registered voters. Circulation of the post is not independent confirmation.",
    },
  ],
  formatRecommendation: "#CheckAm",
  formatNote: "Recommended for the first post.",
  followUpNote: "#ShowYourWorking may be appropriate for a longer follow-up or thread. It is not necessary for the first post.",
  notTrueNote: "Not recommended. #NotTrue does not fit this post.",
};

export const proposalCaveat =
  "The photograph controversy and the 453-polling-unit claim are separate. Reporting on one does not establish the other.";

export const proposalUnknown = "Where the number 453 originated.";

export const proposalAttribution =
  "The original post is the allegation under review. That the words were published is separate from whether the 453 claim is established.";

const findingLabels = new Set<ReviewFindingLabel>(["SUPPORTED BY AVAILABLE REPORTING", "NOT ESTABLISHED", "UNKNOWN"]);
const sourceKinds = new Set<ReviewSourceKind>(["primary record", "independent reporting", "original allegation"]);
const presetAngles = new Set<Exclude<ReviewAngleId, "own">>(["receipts", "serious", "trust"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseEditorReview(value: unknown): EditorReviewPacket | null {
  if (!isRecord(value)) return null;
  if (value.proposedVerdict !== "NEEDS CONTEXT") return null;
  if (typeof value.explanation !== "string" || value.explanation.length < 40) return null;
  if (value.confidence !== "moderate") return null;
  if (value.formatRecommendation !== "#CheckAm") return null;
  if (!Array.isArray(value.findings) || value.findings.length < 4) return null;
  if (!Array.isArray(value.angles) || value.angles.length < 3) return null;
  if (!Array.isArray(value.sources) || value.sources.length < 4) return null;
  const findings = value.findings.flatMap((item) => {
    if (!isRecord(item) || typeof item.text !== "string" || !findingLabels.has(item.label as ReviewFindingLabel)) return [];
    return [{ label: item.label as ReviewFindingLabel, text: item.text }];
  });
  const angles = value.angles.flatMap((item) => {
    if (!isRecord(item) || typeof item.title !== "string" || !Array.isArray(item.points)) return [];
    if (!presetAngles.has(item.id as Exclude<ReviewAngleId, "own">)) return [];
    const points = item.points.filter((point): point is string => typeof point === "string" && point.length > 0);
    if (points.length === 0) return [];
    return [{ id: item.id as Exclude<ReviewAngleId, "own">, title: item.title, points }];
  });
  const sources = value.sources.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.url !== "string" || !item.url.startsWith("https://")) return [];
    if (!sourceKinds.has(item.kind as ReviewSourceKind)) return [];
    if (typeof item.group !== "string" || typeof item.label !== "string" || typeof item.title !== "string" || typeof item.note !== "string") return [];
    return [{
      group: item.group,
      kind: item.kind as ReviewSourceKind,
      label: item.label,
      title: item.title,
      url: item.url,
      note: item.note,
    }];
  });
  if (findings.length < 4 || angles.length < 3 || sources.length < 4) return null;
  return {
    proposedVerdict: "NEEDS CONTEXT",
    explanation: value.explanation,
    confidence: "moderate",
    findings,
    angles,
    sources,
    formatRecommendation: "#CheckAm",
    formatNote: typeof value.formatNote === "string" ? value.formatNote : pollingUnitReview.formatNote,
    followUpNote: typeof value.followUpNote === "string" ? value.followUpNote : pollingUnitReview.followUpNote,
    notTrueNote: typeof value.notTrueNote === "string" ? value.notTrueNote : pollingUnitReview.notTrueNote,
  };
}

export function evidenceUsedFrom(packet: EditorReviewPacket): RecordedSource[] {
  return packet.sources.map((source) => ({ kind: source.kind, label: source.label, url: source.url }));
}

export function parseRecordedSources(value: unknown): RecordedSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string" || !item.url.startsWith("https://")) return [];
    if (!sourceKinds.has(item.kind as ReviewSourceKind) || typeof item.label !== "string") return [];
    return [{ kind: item.kind as ReviewSourceKind, label: item.label, url: item.url }];
  });
}

export function ownAngleWritten(text: string | null | undefined) {
  return (text ?? "").trim().length >= 40;
}

export function angleChosen(angle: string | null | undefined, angleText: string | null | undefined) {
  if (angle === "receipts" || angle === "serious" || angle === "trust") return true;
  if (angle === "own") return ownAngleWritten(angleText);
  return false;
}

export function draftUnlocked(input: { recordedAt: string | null; angle: string | null; angleText: string | null }) {
  if (!input.recordedAt) {
    return { open: false as const, reason: "Accept a verdict before a draft can be created." };
  }
  if (!angleChosen(input.angle, input.angleText)) {
    return { open: false as const, reason: "Select an angle, or write your own, before a draft can be created." };
  }
  return { open: true as const, reason: "Create draft is open. One click is one editor action. The next provider is tried only after a technical failure. Saving a draft does not publish it." };
}
