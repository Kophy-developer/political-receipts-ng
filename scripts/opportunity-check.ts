import { billingPeriodStart, chooseProvider } from "../lib/research/choose";
import { deskClassFor, separatePost } from "../lib/intel/classify";
import { proposeOpportunities, proposeSampleReading } from "../lib/opportunities/rules";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const posts = [
  ["rigged", "All the presidential aspirant should boycott this election, Tinubu has criminally rigged you guys out, is only foolish men will go into 2027 election, Tinubu flooded INEC with his tribal men"],
  ["thin", "The 2027 election in Nigeria is R&D"],
  ["stolen", "I hate Nigeria politicians, I hate Tinubu and APC, the 2027 election has been stolen since 2024"],
  ["greeting", "Happy New Month. As we move closer to the 2027 elections, let's remain informed and engaged."],
  ["threat", "You criminals at that INEC will set Nigeria on fire for wanting to rig 2027 election"],
  ["taunt", "Ipob will be very strong after 2027 elections. Sokoto prison security must be reinforced."],
  ["question", "2027 election is a matter of life and death. When will Enough be Enough in Nigeria?"],
  ["wish", "If am Peter Obi, when I win the 2027 elections, I'll make Prof Pat Utomi Minister for Industries."],
  ["register", "The Director of ICT at INEC has been accused of allowing AI-generated photographs into the voter register."],
  ["units", "INEC is a criminal organisation that secretly created 453 polling units for AI-created voters."],
  ["secret", "Is it ok for INEC to manipulate the system, create a secret polling unit, and use AI to generate fake people?"],
  ["warning", "You cannot use AI-generated faces to create the impression of genuine voters and manipulate voter records in Nigeria."],
] as const;

const readings = posts.map(([name, text]) => ({ name, ...proposeOpportunities([{ text, username: "one" }]) }));
const filed = readings.filter((item) => item.worthSaying);
const types = filed.flatMap((item) => item.proposals.map((proposal) => proposal.type));
const count = (type: string) => types.filter((item) => item === type).length;
const one = (name: string) => readings.find((item) => item.name === name);

check("thin skipped", one("thin")?.worthSaying === false);
check("greeting skipped", one("greeting")?.worthSaying === false);
check("taunt skipped", one("taunt")?.worthSaying === false);
check("threat skipped", one("threat")?.worthSaying === false);
check("vague rigging skipped", one("rigged")?.worthSaying === false);
check("vague stolen skipped", one("stolen")?.worthSaying === false);
check("register is one high check", one("register")?.proposals.length === 1 && one("register")?.proposals[0]?.type === "check" && one("register")?.proposals[0]?.score === "high" && one("register")?.proposals[0]?.research === "yes");
check("units stay a check despite criminal", one("units")?.proposals.length === 1 && one("units")?.proposals[0]?.type === "check" && one("units")?.proposals[0]?.score === "high" && one("units")?.proposals[0]?.research === "yes");
check("units keep both sentences", (one("units")?.proposals[0]?.angles.length ?? 0) >= 2);
check("secret question is not a second card", one("secret")?.proposals.length === 1 && one("secret")?.proposals[0]?.type === "check" && one("secret")?.proposals[0]?.score === "medium");
check("warning is not a check", one("warning")?.worthSaying === false);
check("wish is an opinion without research", one("wish")?.proposals.length === 1 && one("wish")?.proposals[0]?.type === "opinion" && one("wish")?.proposals[0]?.research === "no");
check("question needs no research", one("question")?.proposals.length === 1 && one("question")?.proposals[0]?.type === "question" && one("question")?.proposals[0]?.research === "no");
check("no humour forced", count("humour") === 0);
check("no original insight forced", count("original_insight") === 0);

const occupy = proposeOpportunities([
  { text: "Get ready to OCCUPY every INEC office. Rig and Die is not a mere saying.", username: "PUTCCM_" },
  { text: "Get ready to OCCUPY every INEC office. Rig and Die is not a mere saying.", username: "PUTCCM_" },
  { text: "Get ready to OCCUPY every INEC office. Rig and Die is not a mere saying.", username: "PUTCCM_" },
]);
check("occupy is one analysis", occupy.proposals.length === 1 && occupy.proposals[0]?.type === "analysis" && occupy.proposals[0]?.research === "no" && occupy.proposals[0]?.score === "low");
check("occupy counts one account", occupy.posts === 3 && occupy.accounts === 1);

check("453 is actionable", deskClassFor("INEC is a criminal organisation that secretly created 453 polling units for AI-created voters.", "political") === "actionable");
check("threat stays noise", deskClassFor("You criminals at that INEC will set Nigeria on fire for wanting to rig 2027 election", "political") === "noise");
check("occupy is discussion", deskClassFor("Get ready to OCCUPY every INEC office.", "political") === "discussion");
check("warning is discussion", deskClassFor("You cannot use AI-generated faces to manipulate voter records in Nigeria and then expect people to move on as though nothing happened.", "not_political") === "discussion");
check("453 separates the number from the insult", separatePost("INEC secretly created 453 polling units for AI-created voters and is a criminal organisation.").claims.length >= 2);

const sample = proposeSampleReading([
  { text: "INEC secretly created 453 polling units for AI-created voters.", username: "ClassicEchelon" },
  { text: "The Director of ICT has been accused of allowing AI-generated photographs into the voter register.", username: "Dee_9889" },
  { text: "Get ready to OCCUPY every INEC office.", username: "PUTCCM_" },
]);
check("sample needs two accounts", sample?.type === "analysis" && sample.research === "recommended" && sample.accountCount === 2 && sample.postCount === 2);

const open = { tavilyConfigured: false, braveConfigured: false, tavilyUsed: 0, braveUsed: 0, tavilyCeiling: 900, braveCeiling: 900, intent: "auto" as const, preference: "tavily" as const };
const none = chooseProvider(open);
check("no key stops", none.ok === false && none.ok === false && "message" in none && none.message.includes("TAVILY_API_KEY"));
const fallback = chooseProvider({ ...open, braveConfigured: true });
check("missing tavily can use brave", fallback.ok === true && fallback.provider === "brave" && (fallback.fallback ?? "").includes("credential"));
const spent = chooseProvider({ ...open, tavilyConfigured: true, braveConfigured: true, tavilyUsed: 900, braveUsed: 900 });
check("both ceilings stop", spent.ok === false && "message" in spent && spent.message.includes("Monthly research allowance"));
const primary = chooseProvider({ ...open, tavilyConfigured: true });
check("tavily stays primary", primary.ok === true && primary.provider === "tavily" && primary.fallback === null);
const braveOnly = chooseProvider({ ...open, preference: "brave" });
check("brave preference does not jump to tavily", braveOnly.ok === false && "message" in braveOnly && braveOnly.message.includes("BRAVE_API_KEY"));
const second = chooseProvider({ ...open, tavilyConfigured: true, braveConfigured: true, intent: "second", previous: "tavily" });
check("second provider is manual", second.ok === true && second.provider === "brave");
const outage = chooseProvider({ ...open, tavilyConfigured: true, braveConfigured: true, intent: "outage", previous: "tavily" });
check("outage can use brave", outage.ok === true && outage.provider === "brave");

const period = billingPeriodStart(new Date("2026-11-04T12:00:00Z"), 15);
check("billing day rolls back", period.startsWith("2026-10-15"));
const same = billingPeriodStart(new Date("2026-11-04T12:00:00Z"), 1);
check("billing day in month", same.startsWith("2026-11-01"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("opportunity checks passed", { types: count.length ? types : types, check: count("check"), opinion: count("opinion"), question: count("question") });
