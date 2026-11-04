import type { ProposedVerdict } from "@/lib/research/types";

export type VerdictInput = {
  statementKind: "fact" | "analysis" | "opinion";
  evidence: Array<{
    stance: "supports" | "contradicts" | "contextualizes" | "attribution_only";
    review: "proposed" | "accepted" | "rejected";
    tierRank: number;
    social: boolean;
  }>;
};

export type Verdict = {
  factual: ProposedVerdict;
  confidence: "low" | "moderate" | "high";
  reasoning: string;
  caveats: string;
  unknown: string;
  notTrue: boolean;
  attribution: string;
};

export function proposeVerdict(input: VerdictInput): Verdict {
  const accepted = input.evidence.filter((item) => item.review === "accepted");
  const factualEvidence = accepted.filter((item) => item.stance !== "attribution_only" && !item.social);
  const socialOnly = accepted.length > 0 && factualEvidence.length === 0;
  const supports = factualEvidence.filter((item) => item.stance === "supports");
  const contradicts = factualEvidence.filter((item) => item.stance === "contradicts");
  const strongContradict = contradicts.some((item) => item.tierRank <= 2);
  const primarySupport = supports.filter((item) => item.tierRank === 1);
  const attribution = accepted.some((item) => item.stance === "attribution_only")
    ? "A source speaks to whether the words were published. That is separate from whether the words are true."
    : "No source has been marked as attribution only. Whether someone said it is still open.";

  if (input.statementKind === "opinion") {
    return {
      factual: "UNVERIFIED",
      confidence: "low",
      reasoning: contradicts.length
        ? "This is filed as an opinion. A source can disagree with it. That disagreement is not a factual contradiction, and it does not unlock #NotTrue."
        : "This is filed as an opinion. Disagreement is not a factual contradiction.",
      caveats: "A later factual claim inside the same post would need its own evidence.",
      unknown: "Opinions are not given a truth stamp.",
      notTrue: false,
      attribution,
    };
  }
  if (accepted.length === 0) {
    return {
      factual: "INSUFFICIENT EVIDENCE",
      confidence: "low",
      reasoning: "Nothing the editor has accepted bears on this claim.",
      caveats: "A retrieved page stays unreviewed until the editor accepts it.",
      unknown: "The records have not been compared yet.",
      notTrue: false,
      attribution,
    };
  }
  if (socialOnly) {
    return {
      factual: "UNVERIFIED",
      confidence: "low",
      reasoning: "The only accepted material is a social post. That can show circulation. It does not establish the fact.",
      caveats: "A primary record would be required before a verdict.",
      unknown: "The underlying record is still missing.",
      notTrue: false,
      attribution,
    };
  }
  if (supports.length > 0 && contradicts.length > 0) {
    return {
      factual: "NEEDS CONTEXT",
      confidence: "moderate",
      reasoning: "Accepted sources pull in more than one direction. The claim is not stamped as simply true or false.",
      caveats: "The narrower reading and the broader reading need to stay visible.",
      unknown: "Which reading a reader would take is not settled by the pack alone.",
      notTrue: false,
      attribution,
    };
  }
  if (contradicts.length > 0 && supports.length === 0) {
    const high = strongContradict && contradicts.some((item) => item.tierRank === 1);
    return {
      factual: "CONTRADICTED",
      confidence: high ? "high" : "moderate",
      reasoning: high
        ? "A primary source the editor accepted contradicts the factual claim."
        : "Accepted evidence contradicts the claim, short of a primary source.",
      caveats: high ? "The contradiction covers the material claim, not a side remark." : "#NotTrue stays off until a primary contradiction is accepted.",
      unknown: "Anything outside the contradicted sentence is untouched.",
      notTrue: high && input.statementKind === "fact",
      attribution,
    };
  }
  if (primarySupport.length >= 2) {
    return {
      factual: "SUPPORTED",
      confidence: "high",
      reasoning: "Two accepted primary sources support the claim, and none accepted contradicts it.",
      caveats: "Support is only as wide as those passages.",
      unknown: "Later revisions of the official figure are not in this pack.",
      notTrue: false,
      attribution,
    };
  }
  if (primarySupport.length === 1) {
    return {
      factual: "SUPPORTED",
      confidence: "moderate",
      reasoning: "One accepted primary source supports the claim. That is enough to lean on, not enough to shout.",
      caveats: "A second independent record is not in the pack.",
      unknown: "Whether another official series disagrees is unknown here.",
      notTrue: false,
      attribution,
    };
  }
  if (factualEvidence.some((item) => item.stance === "contextualizes")) {
    return {
      factual: "NEEDS CONTEXT",
      confidence: "low",
      reasoning: "The accepted material adds context. It does not settle the claim.",
      caveats: "Context is not support.",
      unknown: "The direct record is still missing.",
      notTrue: false,
      attribution,
    };
  }
  return {
    factual: "INSUFFICIENT EVIDENCE",
    confidence: "low",
    reasoning: "The accepted pack does not reach a verdict.",
    caveats: "No classification is set above the evidence.",
    unknown: "The comparison is unfinished.",
    notTrue: false,
    attribution,
  };
}
