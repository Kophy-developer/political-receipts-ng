import type { SourceQuality } from "@/lib/editorial/quality";

export type QuestionPurpose = "verification" | "context" | "historical_comparison" | "numerical_analysis" | "event_investigation";

export type ResearchQuestionPlan = {
  purpose: QuestionPurpose;
  question: string;
};

export type Investigation = {
  numerical: boolean;
  attribution: string;
  authorAssertsQuotedClaim: boolean;
  questions: ResearchQuestionPlan[];
  definitions: string[];
  preferredHosts: string[];
  rejectedSubstitutes: string[];
  focusSeries: string | null;
};

const investmentDefinitions = [
  "Foreign direct investment is a lasting stake in a business. It is not the same series as portfolio investment.",
  "Portfolio investment is a financial-market flow. It is not an announcement that a company plans to invest.",
  "Capital importation, as published by Nigeria's statistics office, is a measured inflow. It is not a State House announcement and it is not, by itself, foreign direct investment.",
  "An investment announcement is a statement of intent. It is not a recorded flow.",
];

function investmentTopic(text: string) {
  return /\b(invest(?:ing|ment|ed)?|capital importation|foreign direct)\b/i.test(text) && /\b(compan(?:y|ies)|economy|tinubu|foreign|importation)\b/i.test(text);
}

export function investigate(sourceText: string, quality: SourceQuality, pillar?: string | null): Investigation {
  const text = `${sourceText}\n${quality.summary}`;
  const rejects = /rejects another person's claim|does not assert/i.test(quality.summary);
  const polling = /\b453\b/.test(text) && /polling|inec|voter register/i.test(text);
  const prediction = quality.primaryKind === "prediction";
  const event = quality.primaryKind === "event";
  const football = /\b(manchester united|premier league|goal|fixture)\b/i.test(text);
  const namedUnited = pillar === "manchester_united" || pillar === "football";
  const economicFigure = /\d/.test(text) && /\b(percent|per cent|%|naira|inflation|mpr|interest rate|exchange rate|basis point|billion|million)\b/i.test(text);
  const policy = /\b(policy|executive order|appropriation|electoral act|bill)\b/i.test(text);
  const numerical = !polling && !prediction && investmentTopic(text);

  if (polling) {
    return {
      numerical: false,
      attribution: quality.summary,
      authorAssertsQuotedClaim: true,
      questions: [
        { purpose: "verification", question: "What does the INEC record say about the polling-unit figure in this story?" },
        { purpose: "event_investigation", question: "Is the reported controversy about photographs separate from the polling-unit count?" },
      ],
      definitions: [],
      preferredHosts: ["inecnigeria.org"],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (namedUnited && quality.researchNeed === "no") {
    return {
      numerical: false,
      attribution: "This is a football reaction. It is not sent through a political fact-check.",
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "context", question: "Is this a supporter's judgment, or a report that still needs the club or the competition?" },
      ],
      definitions: [],
      preferredHosts: ["manutd.com", "premierleague.com"],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (namedUnited) {
    return {
      numerical: false,
      attribution: quality.summary || "The post states a club fact.",
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "verification", question: "What do Manchester United, the Premier League, UEFA, or the FA record for this?" },
      ],
      definitions: ["A transfer rumour or an injury report is not a confirmed signing or a confirmed absence."],
      preferredHosts: ["manutd.com", "premierleague.com", "uefa.com", "thefa.com"],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (pillar === "finance" && (economicFigure || quality.researchNeed === "yes") && !investmentTopic(text)) {
    return {
      numerical: true,
      attribution: quality.summary,
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "verification", question: "Which office published this figure, for which period, and in which unit?" },
        { purpose: "numerical_analysis", question: "What definition does that office give the series, and what does a neighbouring period show?" },
      ],
      definitions: ["The figure keeps its unit, its reporting period, and the office's definition."],
      preferredHosts: ["cbn.gov.ng", "nigerianstat.gov.ng", "dmo.gov.ng", "budgetoffice.gov.ng", "ngxgroup.com"],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (prediction) {
    return {
      numerical: false,
      attribution: "The post is speculating. This desk does not turn that sentence into an election forecast.",
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "context", question: "What would later count as the event, and what must a draft refuse to forecast?" },
      ],
      definitions: [],
      preferredHosts: [],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (event) {
    return {
      numerical: false,
      attribution: quality.summary,
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "event_investigation", question: "Did the reported visit happen, and on what date, with which people?" },
        { purpose: "context", question: "Which sentences are praise or commentary rather than the event?" },
      ],
      definitions: [],
      preferredHosts: [],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (football && quality.researchNeed !== "yes") {
    return {
      numerical: false,
      attribution: "This is a football reaction. It is not sent through a political fact-check.",
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "context", question: "Is there a match record that would help, or is this a supporter's judgment?" },
      ],
      definitions: [],
      preferredHosts: ["premierleague.com", "manutd.com"],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (numerical) {
    return {
      numerical: true,
      attribution: rejects
        ? "The author rejects another person's statement that foreign companies are investing because of Tinubu and that the economy is the best it has ever been. The author is not recorded as saying foreign companies are not investing."
        : quality.summary,
      authorAssertsQuotedClaim: false,
      questions: [
        { purpose: "verification", question: "What do available official statistics show about foreign investment in Nigeria?" },
        { purpose: "context", question: "What is the difference between foreign direct investment, portfolio investment, total capital importation, and investment announcements?" },
        { purpose: "historical_comparison", question: "What do comparable annual figures show over approximately ten years?" },
        { purpose: "numerical_analysis", question: "What do the most recent three years show, and what are the year-on-year changes?" },
        { purpose: "numerical_analysis", question: "Are increases or decreases consistent across different measures?" },
        { purpose: "context", question: "Can the available evidence establish why investment changed?" },
        { purpose: "verification", question: "Does the data support a broad assertion that the economy is historically at its best?" },
      ],
      definitions: investmentDefinitions,
      preferredHosts: ["nigerianstat.gov.ng", "cbn.gov.ng", "data.worldbank.org", "worldbank.org", "unctad.org"],
      rejectedSubstitutes: ["statehouse.gov.ng"],
      focusSeries: "capital importation",
    };
  }
  if (policy) {
    return {
      numerical: false,
      attribution: quality.summary || "The post is about an official text.",
      authorAssertsQuotedClaim: !rejects,
      questions: [
        { purpose: "verification", question: "What does the official policy, legislation, or announcement actually say?" },
      ],
      definitions: [],
      preferredHosts: [],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  if (quality.researchNeed === "yes" && quality.checkableFacts.length) {
    return {
      numerical: false,
      attribution: quality.summary,
      authorAssertsQuotedClaim: !rejects,
      questions: quality.checkableFacts.map((fact) => ({ purpose: "verification" as const, question: `What record addresses this premise: ${fact}` })),
      definitions: [],
      preferredHosts: [],
      rejectedSubstitutes: [],
      focusSeries: null,
    };
  }
  return {
    numerical: false,
    attribution: quality.summary || "The post is a judgment. It is not scored as true or false for lack of a statistic.",
    authorAssertsQuotedClaim: false,
    questions: [
      { purpose: "context", question: "What documented context, if any, would help a reader understand the disagreement?" },
    ],
    definitions: [],
    preferredHosts: [],
    rejectedSubstitutes: [],
    focusSeries: null,
  };
}
