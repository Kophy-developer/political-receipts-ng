import { billingPeriodStart, chooseProvider } from "../lib/research/choose";
import { proposeOpportunities } from "../lib/opportunities/rules";

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
] as const;

const readings = posts.map(([name, text]) => ({ name, ...proposeOpportunities([{ text }]) }));
const filed = readings.filter((item) => item.worthSaying);
const types = filed.flatMap((item) => item.proposals.map((proposal) => proposal.type));
const count = (type: string) => types.filter((item) => item === type).length;

check("thin skipped", readings.find((item) => item.name === "thin")?.worthSaying === false);
check("greeting skipped", readings.find((item) => item.name === "greeting")?.worthSaying === false);
check("taunt skipped", readings.find((item) => item.name === "taunt")?.worthSaying === false);
check("register is a high check", readings.find((item) => item.name === "register")?.proposals.some((item) => item.type === "check" && item.score === "high" && item.research === "yes") === true);
check("wish is an opinion without research", readings.find((item) => item.name === "wish")?.proposals.some((item) => item.type === "opinion" && item.research === "no") === true);
check("question needs no research", readings.find((item) => item.name === "question")?.proposals.some((item) => item.type === "question" && item.research === "no") === true);
check("heat does not score high", readings.find((item) => item.name === "threat")?.proposals.every((item) => item.score !== "high") === true);
check("no humour forced", count("humour") === 0);
check("no original insight forced", count("original_insight") === 0);
check("checks exist", count("check") >= 3);

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
