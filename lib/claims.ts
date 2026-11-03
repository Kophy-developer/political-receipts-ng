// Demonstration seed input. The desk does not render this module.
import type { Claim } from "@/lib/types";

export const claims: Claim[] = [
  {
    id: "clm-2401",
    claim:
      "Premium motor spirit is back to the pre-subsidy price. Nigerians are paying what they paid in early 2023.",
    speaker: "Sample account",
    handle: "@PumpWatchNG",
    role: "Widely shared post in the sample set",
    postText:
      "Good news. PMS is back to the pre-subsidy price. We are paying what we paid in early 2023. Anybody saying otherwise is doing politics.",
    postedAt: "03 Nov 2026 · 08:11 WAT",
    topic: "Fuel Prices",
    topicId: "fuel",
    virality: "Extreme",
    viralityScore: 94,
    status: "Contradicted",
    confidence: 88,
    engagement: { replies: "4.2k", reposts: "18.6k", likes: "22.1k", views: "1.4M" },
    evidence: [
      {
        id: "ev-2401-a",
        organization: "NMDPRA",
        title: "Downstream price band before the May 2023 subsidy announcement",
        published: "May 2023",
        urlPlaceholder: "placeholder://nmdpra/pms-band-may-2023",
        excerpt:
          "Before the 29 May 2023 subsidy announcement, the regulated PMS pump price sat in the ₦185–₦195 per litre band. That is the early-2023 reference price in this pack.",
        sourceType: "Regulator advisory",
        tier: "Primary Government Source",
        reliability: "High",
      },
      {
        id: "ev-2401-b",
        organization: "National Bureau of Statistics",
        title: "Transport and energy price notes after the subsidy announcement",
        published: "2023–2024 series",
        urlPlaceholder: "placeholder://nbs/transport-energy-notes",
        excerpt:
          "Official price reporting after May 2023 places typical urban pump prices several hundred naira per litre above the early-2023 band. The series does not show a return to ₦185–₦195.",
        sourceType: "Statistical release",
        tier: "Official Statistics",
        reliability: "High",
      },
      {
        id: "ev-2401-c",
        organization: "Premium Times",
        title: "Contemporary report of the post-announcement pump price jump",
        published: "30 May 2023",
        urlPlaceholder: "placeholder://premiumtimes/pms-may-2023",
        excerpt:
          "Reporting at the time recorded an immediate move toward roughly ₦500 per litre at many stations, with later prices higher still. The clip does not show a later return to the old band.",
        sourceType: "News report",
        tier: "Established News Organization",
        reliability: "Substantial",
      },
      {
        id: "ev-2401-d",
        organization: "Africa Check",
        title: "Method note on comparing pump prices",
        published: "Desk extract",
        urlPlaceholder: "placeholder://africacheck/pms-method",
        excerpt:
          "A like-for-like comparison has to name the month, the city, and whether the price is regulated or a station board. The circulating post names none of the three.",
        sourceType: "Prior fact-check method",
        tier: "Independent Fact Checker",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "The regulated PMS price before 29 May 2023 was about ₦185–₦195 per litre.",
        "Reported pump prices after that date left that band.",
      ],
      supports: [
        "The sources in this pack do not support a return to the early-2023 price.",
        "“Back to the pre-subsidy price” overstates what the station and statistical record shows.",
      ],
      uncertain: [
        "The exact litre price at one named station today. Prices are local. A single discount would not make the national claim true.",
        "How much of the increase is crude, the exchange rate, or logistics. That is a different claim, and this pack does not settle it.",
      ],
      classification: "CONTRADICTED",
      note: "The national price claim is contradicted. The stamp does not extend to the cause of the increase, and it does not quote a live control price for this morning.",
      hashtag: "#NotTrue",
      hashtagReason:
        "#NotTrue is available because the specific comparison — early 2023 versus a return to that price — is clearly contradicted. The post must still say that one station cannot stand in for the country.",
    },
  },
  {
    id: "clm-2415",
    claim: "INEC registered 93,469,008 voters for the 2023 general election.",
    speaker: "Sample account",
    handle: "@RegisterNote",
    role: "Citation post in the sample set",
    postText:
      "For the record: INEC registered 93,469,008 voters for the 2023 general election. That is the published figure.",
    postedAt: "01 Nov 2026 · 11:22 WAT",
    topic: "INEC",
    topicId: "inec",
    virality: "Moderate",
    viralityScore: 61,
    status: "Verified",
    confidence: 92,
    engagement: { replies: "640", reposts: "2.1k", likes: "3.4k", views: "410k" },
    evidence: [
      {
        id: "ev-2415-a",
        organization: "INEC",
        title: "Register of voters published for the 2023 general election",
        published: "2023",
        urlPlaceholder: "placeholder://inec/register-2023",
        excerpt:
          "INEC published 93,469,008 as the number of registered voters for the 2023 general election.",
        sourceType: "Official register",
        tier: "Primary Government Source",
        reliability: "High",
      },
      {
        id: "ev-2415-b",
        organization: "INEC",
        title: "Commission briefing citing the same register total",
        published: "2023",
        urlPlaceholder: "placeholder://inec/briefing-register-2023",
        excerpt:
          "The commission’s own briefing uses the same total. It is a description of the 2023 roll, not a projection.",
        sourceType: "Official briefing",
        tier: "Primary Government Source",
        reliability: "High",
      },
      {
        id: "ev-2415-c",
        organization: "Reuters",
        title: "Report citing INEC’s published register",
        published: "2023",
        urlPlaceholder: "placeholder://reuters/inec-register-2023",
        excerpt:
          "Contemporary reporting attributes the figure to INEC’s published register and does not treat it as a later enrolment total.",
        sourceType: "News report",
        tier: "Established News Organization",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "INEC published 93,469,008 registered voters for the 2023 general election.",
      ],
      supports: [
        "As a statement about that 2023 register, the sentence matches the official figure in this pack.",
      ],
      uncertain: [
        "This is not a live count of voters registered for 2027. Continuous registration, deaths, and transfers change the roll.",
        "The figure does not, by itself, say how many of those records were valid or how many PVCs were collected.",
      ],
      classification: "VERIFIED",
      note: "Verified means the 2023 figure matches INEC’s published register. It does not certify every name on the roll, and it says nothing about 2027.",
      hashtag: "#CheckAm",
      hashtagReason:
        "#CheckAm fits a narrow, sourced confirmation. #NotTrue does not. The sentence that was checked is the 2023 total, and that sentence holds.",
    },
  },
  {
    id: "clm-2408",
    claim:
      "Nigeria’s inflation is a Lagos problem. Prices outside Lagos have been stable.",
    speaker: "Sample account",
    handle: "@CityVsRest",
    role: "Widely shared post in the sample set",
    postText:
      "Let’s be honest. Inflation is a Lagos problem. Outside Lagos, prices have been stable. Stop nationalising one city’s market.",
    postedAt: "02 Nov 2026 · 07:02 WAT",
    topic: "Cost of Living",
    topicId: "cost-of-living",
    virality: "High",
    viralityScore: 86,
    status: "Needs Context",
    confidence: 76,
    engagement: { replies: "6.1k", reposts: "9.4k", likes: "14.2k", views: "980k" },
    evidence: [
      {
        id: "ev-2408-a",
        organization: "National Bureau of Statistics",
        title: "CPI, headline, urban and rural",
        published: "Recent monthly series in the pack",
        urlPlaceholder: "placeholder://nbs/cpi-urban-rural",
        excerpt:
          "The CPI is a national series. In the months in this pack, urban and rural inflation were both elevated. Rural inflation was not a flat line, and in some months it ran ahead of the urban index.",
        sourceType: "Statistical release",
        tier: "Official Statistics",
        reliability: "High",
      },
      {
        id: "ev-2408-b",
        organization: "National Bureau of Statistics",
        title: "Selected food price watch",
        published: "Series in the pack",
        urlPlaceholder: "placeholder://nbs/food-price-watch",
        excerpt:
          "Food items rose across the locations NBS tracks. Lagos often shows a higher naira price. A higher level is not the same thing as being the only place the price rose.",
        sourceType: "Statistical release",
        tier: "Official Statistics",
        reliability: "High",
      },
      {
        id: "ev-2408-c",
        organization: "Dubawa",
        title: "Explainer on level versus rate of change",
        published: "Desk extract",
        urlPlaceholder: "placeholder://dubawa/cpi-level-rate",
        excerpt:
          "Prior explainers separate “expensive in naira” from “the inflation rate”. The post uses the first idea to deny the second.",
        sourceType: "Prior fact-check",
        tier: "Independent Fact Checker",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "NBS measures inflation nationally and publishes urban and rural indices.",
        "Lagos often has higher absolute prices than many other cities.",
      ],
      supports: [
        "The pack does not support the sentence “prices outside Lagos have been stable.”",
        "Calling inflation a Lagos problem confuses a price level with a rate of change.",
      ],
      uncertain: [
        "A particular town, and a particular item, may have been flat for a month. The post states a national pattern.",
        "This week’s full state-by-state index is not in the pack. The national and rural series are.",
      ],
      classification: "NEEDS CONTEXT",
      note: "The broad claim fails, but “stable” is undefined and the desk will not invent a single alternative inflation rate for every state. #NotTrue would sound cleaner than the evidence is.",
      hashtag: "#CheckAm",
      hashtagReason:
        "#NotTrue was declined. The post is misleading, and it is also too vague to knock down with one replacement number. #CheckAm lets the desk show the index and the missing definition.",
    },
  },
  {
    id: "clm-2388",
    claim:
      "Nigeria now generates 40,000 megawatts, enough for every household to have steady power.",
    speaker: "Sample account",
    handle: "@GridTalkNG",
    role: "Recycled claim in the sample set",
    postText:
      "Nigeria now generates 40,000 megawatts. That is enough for every household to have steady power. The grid problem is over.",
    postedAt: "02 Nov 2026 · 19:28 WAT",
    topic: "Electricity",
    topicId: "electricity",
    virality: "High",
    viralityScore: 83,
    status: "Contradicted",
    confidence: 90,
    engagement: { replies: "3.3k", reposts: "11.2k", likes: "9.8k", views: "860k" },
    evidence: [
      {
        id: "ev-2388-a",
        organization: "NERC",
        title: "Installed grid capacity in regulatory reporting",
        published: "Reporting band used in this pack",
        urlPlaceholder: "placeholder://nerc/installed-capacity",
        excerpt:
          "Regulatory reporting puts installed grid capacity a little above 13,000 megawatts. 40,000 megawatts does not appear as installed capacity.",
        sourceType: "Regulatory report",
        tier: "Primary Government Source",
        reliability: "High",
      },
      {
        id: "ev-2388-b",
        organization: "Official agency publications",
        title: "Delivered generation on the grid",
        published: "Operational band in this pack",
        urlPlaceholder: "placeholder://grid/delivered-generation",
        excerpt:
          "Power actually delivered to the grid on a typical day is discussed in the low thousands of megawatts, often in a band around 4,000–5,500 MW depending on gas, plants, and the day. The pack contains no reading of 40,000 MW.",
        sourceType: "Operational report",
        tier: "Official Statistics",
        reliability: "High",
      },
      {
        id: "ev-2388-c",
        organization: "Federal Government publications",
        title: "Generation targets distinguished from measured output",
        published: "Policy papers in the pack",
        urlPlaceholder: "placeholder://fg/generation-targets",
        excerpt:
          "Large round numbers in the tens of thousands of megawatts appear as aspirations, not as measured output. A target is not a generation figure.",
        sourceType: "Policy document",
        tier: "Primary Government Source",
        reliability: "Substantial",
      },
      {
        id: "ev-2388-d",
        organization: "FactCheckHub",
        title: "Note on generation versus power in the home",
        published: "Desk extract",
        urlPlaceholder: "placeholder://factcheckhub/mw-versus-supply",
        excerpt:
          "Even a higher generation number would not mean steady power in every home. Transmission, distribution, and gas constrain what arrives.",
        sourceType: "Prior fact-check",
        tier: "Independent Fact Checker",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "Installed grid capacity in this pack is a little above 13,000 MW, not 40,000 MW.",
        "Delivered generation is typically a few thousand megawatts, varying by day.",
        "40,000 MW resembles a target, not a measured output.",
      ],
      supports: [
        "The sentence “Nigeria now generates 40,000 megawatts” is not supported.",
        "The second clause, that this is enough for steady power in every home, fails with it. Supply at the house is a further constraint, not a deduction from a round number.",
      ],
      uncertain: [
        "This morning’s exact megawatt reading. The pack is a reporting band, not a live control-room scrape, so the draft must not invent today’s figure.",
        "Captive and off-grid generation sits outside the grid number. It does not turn 40,000 MW into the grid total.",
      ],
      classification: "CONTRADICTED",
      note: "Contradicted on the 40,000 MW claim. The desk will not replace it with a false-precise number for today.",
      hashtag: "#NotTrue",
      hashtagReason:
        "The measured record and the claimed output are far apart. #NotTrue is warranted if the post refuses to invent a live megawatt count.",
    },
  },
  {
    id: "clm-2394",
    claim: "The national minimum wage is still ₦30,000.",
    speaker: "Sample account",
    handle: "@WageBoardNG",
    role: "Widely shared post in the sample set",
    postText:
      "Stop confusing people. The national minimum wage is still ₦30,000. Nothing has changed.",
    postedAt: "01 Nov 2026 · 18:16 WAT",
    topic: "Minimum Wage",
    topicId: "minimum-wage",
    virality: "High",
    viralityScore: 79,
    status: "Contradicted",
    confidence: 84,
    engagement: { replies: "5.5k", reposts: "7.2k", likes: "11.0k", views: "720k" },
    evidence: [
      {
        id: "ev-2394-a",
        organization: "National Assembly",
        title: "National Minimum Wage (Amendment) Act 2024",
        published: "July 2024",
        urlPlaceholder: "placeholder://nass/minimum-wage-amendment-2024",
        excerpt:
          "The amended Act sets the national minimum wage at ₦70,000. It replaced the previous ₦30,000 statutory rate.",
        sourceType: "Act",
        tier: "Legislation/Court Record",
        reliability: "High",
      },
      {
        id: "ev-2394-b",
        organization: "Federal Government publications",
        title: "Assent and commencement notices for the amended wage",
        published: "July 2024",
        urlPlaceholder: "placeholder://fg/minimum-wage-assent-2024",
        excerpt:
          "Assent was reported in July 2024. The legal rate and the date of assent are public. Compliance is not settled by the signing ceremony.",
        sourceType: "Official notice",
        tier: "Primary Government Source",
        reliability: "High",
      },
      {
        id: "ev-2394-c",
        organization: "Premium Times",
        title: "Reporting on uneven state implementation",
        published: "2024–2025",
        urlPlaceholder: "placeholder://premiumtimes/wage-implementation",
        excerpt:
          "Reporting after assent described delays and disputes over conformity in some states. A statutory rate and a payslip remained different facts.",
        sourceType: "News report",
        tier: "Established News Organization",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "The National Minimum Wage (Amendment) Act 2024 sets the statutory national rate at ₦70,000.",
        "The previous statutory figure was ₦30,000.",
      ],
      supports: [
        "As a statement of the current statutory national rate, “still ₦30,000” does not match the Act.",
      ],
      uncertain: [
        "Whether a named employer or a named state is paying ₦70,000. The law does not prove the payslip.",
        "Arrears, exemptions, and who the Act covers are outside this sentence. The post did not raise them, and the draft should not pretend to settle them.",
      ],
      classification: "CONTRADICTED",
      note: "Contradicted on the statute. The desk will not say every worker has received ₦70,000. That stronger sentence is not in the evidence.",
      hashtag: "#CheckAm",
      hashtagReason:
        "#NotTrue was declined. Readers can confuse the law with their own pay. #CheckAm carries both facts: the Act says ₦70,000, and a payslip is a separate document.",
    },
  },
  {
    id: "clm-2370",
    claim:
      "The federal education budget meets the UNESCO recommendation of 15 to 20 percent.",
    speaker: "Sample account",
    handle: "@BenchmarksNG",
    role: "Policy post in the sample set",
    postText:
      "The federal education budget meets the UNESCO recommendation of 15 to 20 percent. This argument should be retired.",
    postedAt: "30 Oct 2026 · 10:18 WAT",
    topic: "Education",
    topicId: "education",
    virality: "Moderate",
    viralityScore: 58,
    status: "Contradicted",
    confidence: 80,
    engagement: { replies: "880", reposts: "1.6k", likes: "2.2k", views: "240k" },
    evidence: [
      {
        id: "ev-2370-a",
        organization: "Government budgets",
        title: "Federal education lines against the total federal budget",
        published: "Recent full-year budgets in the pack",
        urlPlaceholder: "placeholder://budget/education-share",
        excerpt:
          "In the federal budgets in this pack, education’s share of the total sits in the single digits, including when related education lines beyond the ministry alone are counted. It does not reach 15 percent.",
        sourceType: "Appropriation tables",
        tier: "Legislation/Court Record",
        reliability: "High",
      },
      {
        id: "ev-2370-b",
        organization: "Budget Office",
        title: "Budget Office presentation of sectoral shares",
        published: "Documents in the pack",
        urlPlaceholder: "placeholder://budgetoffice/sectoral-shares",
        excerpt:
          "The Budget Office presentations in the pack show education below the 15 percent line. The exact percentage moves with the year and with which lines are included. None of the readings reach the benchmark.",
        sourceType: "Fiscal publication",
        tier: "Primary Government Source",
        reliability: "High",
      },
      {
        id: "ev-2370-c",
        organization: "Established news organizations",
        title: "Explainers distinguishing the UNESCO benchmark from a Nigerian legal requirement",
        published: "Desk extract",
        urlPlaceholder: "placeholder://news/unesco-benchmark",
        excerpt:
          "The 15–20 percent figure is a widely cited UNESCO recommendation for public education spending. It is not a finding that a particular Nigerian budget has met it, and it is not a domestic statute.",
        sourceType: "News explainer",
        tier: "Established News Organization",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "UNESCO’s 15–20 percent figure is a recommendation, not a Nigerian statute.",
        "Federal education shares in the budgets in this pack are below 15 percent, and below 10 percent on the readings included.",
      ],
      supports: [
        "The claim that the federal education budget meets the benchmark is not supported.",
      ],
      uncertain: [
        "A combined federal, state, and local ratio for the current year is not in the pack. The claim says federal, so the draft stays there.",
        "A second reader is still matching which related lines a generous count would include. The hold is about the boundary of the percentage, not about whether it reaches 15.",
      ],
      classification: "CONTRADICTED",
      note: "Contradicted for the federal claim in this pack. The package stays off the approval bench until the second read of the budget lines is signed.",
      hashtag: "#CheckAm",
      hashtagReason:
        "#ShowYourWorking would also fit, because the value is in the denominator. The desk’s default for a checkable budget sentence is #CheckAm, with the lines named in the post.",
    },
  },
  {
    id: "clm-2366",
    claim: "Debt service now takes more than 90 percent of federal revenue.",
    speaker: "Sample account",
    handle: "@FiscalMargin",
    role: "Policy post in the sample set",
    postText:
      "Debt service now takes more than 90 percent of federal revenue. There is nothing left to spend.",
    postedAt: "30 Oct 2026 · 15:02 WAT",
    topic: "Government Spending",
    topicId: "spending",
    virality: "High",
    viralityScore: 77,
    status: "Needs Context",
    confidence: 68,
    engagement: { replies: "2.4k", reposts: "6.6k", likes: "8.1k", views: "640k" },
    evidence: [
      {
        id: "ev-2366-a",
        organization: "Budget Office",
        title: "Historical debt-service and revenue tables",
        published: "Releases in the pack",
        urlPlaceholder: "placeholder://budgetoffice/debt-service-revenue",
        excerpt:
          "Some past releases show very high debt-service-to-revenue ratios. On some definitions, figures discussed in those years crossed 80 percent and, in at least one widely cited reading, 90 percent.",
        sourceType: "Fiscal table",
        tier: "Primary Government Source",
        reliability: "Substantial",
      },
      {
        id: "ev-2366-b",
        organization: "DMO",
        title: "Debt service series",
        published: "DMO publications in the pack",
        urlPlaceholder: "placeholder://dmo/debt-service",
        excerpt:
          "The debt office publishes service figures. Pairing them with a revenue total requires choosing a revenue definition. Retained federal revenue, oil revenue, and federation revenue are not the same denominator.",
        sourceType: "Debt report",
        tier: "Official Statistics",
        reliability: "High",
      },
      {
        id: "ev-2366-c",
        organization: "Africa Check",
        title: "Explainer on the moving ratio",
        published: "Desk extract",
        urlPlaceholder: "placeholder://africacheck/debt-service-ratio",
        excerpt:
          "Prior checks have shown the ratio swinging with the year and with provisional versus audited revenue. A post that says “now” and cites neither is not yet a checkable use of those tables.",
        sourceType: "Prior fact-check",
        tier: "Independent Fact Checker",
        reliability: "Substantial",
      },
    ],
    factCheck: {
      known: [
        "Debt service has taken a very large share of federal revenue in some recent years.",
        "The ratio depends on the year and on which revenue number sits underneath it.",
      ],
      supports: [
        "The pack supports a warning that the slogan has a real history. It does not support “more than 90 percent” as a description of an unnamed current period.",
      ],
      uncertain: [
        "The post says “now” and names no document. The current ratio is not established in this pack.",
        "“Nothing left to spend” does not follow even from a high ratio. That clause is rhetoric.",
      ],
      classification: "NEEDS CONTEXT",
      note: "Needs context. The desk will neither confirm nor knock down “more than 90 percent” for a period the post does not name.",
      hashtag: "#CheckAm",
      hashtagReason:
        "#ShowYourWorking is the temptation, and it is fair. #CheckAm is the format because the public sentence is a check, and the honest result is that the sentence is incomplete.",
    },
  },
  {
    id: "clm-2431",
    claim:
      "A new joint security operation has cleared every camp in one north-western state this week.",
    speaker: "Sample account",
    handle: "@FieldNotesNG",
    role: "Unnamed operational claim in the sample set",
    postText:
      "Confirmed. A new joint operation has cleared every camp in one north-western state this week. Share so people can travel.",
    postedAt: "02 Nov 2026 · 21:18 WAT",
    topic: "Security",
    topicId: "security",
    virality: "High",
    viralityScore: 81,
    status: "Unverified",
    confidence: 34,
    engagement: { replies: "1.9k", reposts: "8.4k", likes: "6.6k", views: "540k" },
    evidence: [
      {
        id: "ev-2431-a",
        organization: "Other Source",
        title: "Forwarded situational post with no named unit",
        published: "02 Nov 2026",
        urlPlaceholder: "placeholder://other/forwarded-clearance",
        excerpt:
          "The earliest version in the pack names neither the unit, the state, the date of the operation, nor a document. Later posts add the words “confirmed” without adding a source.",
        sourceType: "Social recap",
        tier: "Other Source",
        reliability: "Low",
      },
    ],
    factCheck: {
      known: [
        "A clearance claim is circulating.",
        "No official situation report in this pack confirms a statewide clearance this week.",
      ],
      supports: [
        "Nothing in the pack supports “every camp” or “confirmed”.",
      ],
      uncertain: [
        "An operation may have taken place. Absence of a report on this desk is not proof that it did not.",
        "The state is not named in the original post. Repeating a guessed state would make the claim more specific than the speaker did.",
      ],
      classification: "UNVERIFIED",
      note: "Unverified. The desk will not convert a missing document into a declaration that the operation is false.",
      hashtag: "#CheckAm",
      hashtagReason:
        "#NotTrue is not available. Strong contradiction requires evidence that the event did not happen. We do not have that. We have an absence.",
    },
  },
  {
    id: "clm-2422",
    claim: "Defence received nothing in the capital budget this year.",
    speaker: "Sample account",
    handle: "@LineItems",
    role: "Budget claim, research open",
    postText:
      "Defence received nothing in the capital budget this year. Zero. Read that again.",
    postedAt: "02 Nov 2026 · 21:40 WAT",
    topic: "Security",
    topicId: "security",
    virality: "Moderate",
    viralityScore: 64,
    status: "Researching",
    confidence: null,
    engagement: { replies: "740", reposts: "2.8k", likes: "3.1k", views: "190k" },
    evidence: [
      {
        id: "ev-2422-a",
        organization: "Budget Office",
        title: "Call circular flagged for matching, schedules not yet lined up",
        published: "Current fiscal year, unmatched",
        urlPlaceholder: "placeholder://budgetoffice/defence-capital-unmatched",
        excerpt:
          "A call circular is on the desk. The appropriation schedules that would show the defence capital line have not been matched to the sentence. No stamp is available from a circular alone.",
        sourceType: "Fiscal document, incomplete",
        tier: "Primary Government Source",
        reliability: "Moderate",
      },
    ],
    factCheck: {
      known: ["A claim of a zero capital allocation is circulating."],
      supports: [],
      uncertain: [
        "The capital line for defence in the named year’s Appropriation Act has not been extracted yet.",
        "“This year” may mean calendar year or fiscal year. The post does not say.",
      ],
      classification: null,
      note: "No classification. Research is open, and this desk will not assign a stamp to keep up with the thread.",
      hashtag: null,
      hashtagReason: "No format is suggested until the schedule is on the card.",
    },
  },
  {
    id: "clm-2430",
    claim:
      "INEC has cancelled all existing PVCs. Everyone must register again before 2027.",
    speaker: "Sample account",
    handle: "@CardNotice",
    role: "New rumour, not yet researched",
    postText:
      "INEC has cancelled all existing PVCs. Everyone must register again before 2027. Don’t wait.",
    postedAt: "03 Nov 2026 · 07:51 WAT",
    topic: "INEC",
    topicId: "inec",
    virality: "Extreme",
    viralityScore: 90,
    status: "New",
    confidence: null,
    engagement: { replies: "2.2k", reposts: "21.4k", likes: "16.0k", views: "1.1M" },
    evidence: [],
    factCheck: {
      known: [],
      supports: [],
      uncertain: [
        "The post is circulating. No INEC notice has been opened on this claim.",
      ],
      classification: null,
      note: "No classification. A new claim does not get a stamp.",
      hashtag: null,
      hashtagReason: "No format is suggested until an INEC notice is in the pack, or its absence is recorded properly.",
    },
  },
];

export function claimById(id: string) {
  return claims.find((claim) => claim.id === id);
}

export function claimsForTopic(topicId: string) {
  return claims.filter((claim) => claim.topicId === topicId);
}
