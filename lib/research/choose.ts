export type ResearchProviderId = "tavily" | "brave";

export type ProviderChoice =
  | { ok: true; provider: ResearchProviderId; reason: string; fallback: string | null }
  | { ok: false; message: string };

export function chooseProvider(input: {
  preference: ResearchProviderId;
  tavilyConfigured: boolean;
  braveConfigured: boolean;
  tavilyUsed: number;
  braveUsed: number;
  tavilyCeiling: number;
  braveCeiling: number;
  intent: "auto" | "second" | "outage";
  previous?: ResearchProviderId | null;
}): ProviderChoice {
  const tavilyOpen = input.tavilyConfigured && input.tavilyUsed < input.tavilyCeiling;
  const braveOpen = input.braveConfigured && input.braveUsed < input.braveCeiling;
  const tavilySpent = input.tavilyConfigured && input.tavilyUsed >= input.tavilyCeiling;
  const braveSpent = input.braveConfigured && input.braveUsed >= input.braveCeiling;
  const bothSpent = (!input.tavilyConfigured || tavilySpent) && (!input.braveConfigured || braveSpent) && (input.tavilyConfigured || input.braveConfigured);

  if (input.intent === "second") {
    const other: ResearchProviderId = input.previous === "brave" ? "tavily" : "brave";
    if (other === "brave" && braveOpen) {
      return { ok: true, provider: "brave", reason: "Editor approved a second provider.", fallback: "Editor approved a second provider." };
    }
    if (other === "tavily" && tavilyOpen) {
      return { ok: true, provider: "tavily", reason: "Editor approved a second provider.", fallback: "Editor approved a second provider." };
    }
    if (bothSpent || tavilySpent || braveSpent) return { ok: false, message: "Monthly research allowance reached." };
    return { ok: false, message: `No search was sent. The second provider is not configured.` };
  }

  if (input.intent === "outage") {
    if (input.previous === "tavily" && braveOpen) {
      return { ok: true, provider: "brave", reason: "Tavily did not answer.", fallback: "Tavily API is unavailable." };
    }
    if (input.previous === "brave") return { ok: false, message: "Brave did not answer. No second provider was queried." };
    return { ok: false, message: "The search provider did not answer. No second provider was queried." };
  }

  if (input.preference === "brave") {
    if (braveOpen) return { ok: true, provider: "brave", reason: "RESEARCH_PROVIDER is set to Brave.", fallback: null };
    if (braveSpent) return { ok: false, message: "Monthly research allowance reached." };
    return { ok: false, message: "No search was sent. Set BRAVE_API_KEY on the server." };
  }

  if (tavilyOpen) return { ok: true, provider: "tavily", reason: "Tavily is the primary research provider.", fallback: null };
  if (!input.tavilyConfigured && braveOpen) {
    return { ok: true, provider: "brave", reason: "Tavily credential is unavailable.", fallback: "Tavily credential is unavailable." };
  }
  if (tavilySpent && braveOpen) {
    return { ok: true, provider: "brave", reason: "Tavily has reached the monthly ceiling.", fallback: "Tavily monthly allowance is spent." };
  }
  if (bothSpent || tavilySpent || braveSpent) return { ok: false, message: "Monthly research allowance reached." };
  return { ok: false, message: "No search was sent. Set TAVILY_API_KEY on the server." };
}

export function billingPeriodStart(now = new Date(), anchorDay = 1) {
  const day = Math.min(28, Math.max(1, anchorDay));
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  if (date >= day) return new Date(Date.UTC(year, month, day)).toISOString();
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}
