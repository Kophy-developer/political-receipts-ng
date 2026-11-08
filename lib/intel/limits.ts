import "server-only";
import { publishedRates, scanBudget } from "@/lib/intel/budget";

/** Conservative Phase 1 ceilings. A scan cannot raise these. */
export const scanLimits = scanBudget;

export { publishedRates };

export function lookbackStart(hours: number) {
  const span = Math.min(48, Math.max(1, hours));
  return new Date(Date.now() - span * 60 * 60 * 1000).toISOString();
}

export function lagosDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T00:00:00+01:00`).toISOString();
}

export function lagosDayLabel(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
}

export function usd(amount: number) {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
