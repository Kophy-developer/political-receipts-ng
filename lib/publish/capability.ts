import { characterCount } from "@/lib/format";

/** Standard post length. This is not a limit of the create endpoint itself. */
export const standardPostLimit = 280;

/** Documented long-form maximum on POST /2/tweets. Changelog, 20 Aug 2024. */
export const longFormPostLimit = 25_000;

export const subscriptionTypes = ["None", "Basic", "Premium", "PremiumPlus"] as const;

export type SubscriptionType = (typeof subscriptionTypes)[number];

/**
 * Which stored subscription types may send a long post.
 * Isolated so a change in X's rules is one edit, not a search through the desk.
 */
export const longFormEntitlements: readonly SubscriptionType[] = ["Basic", "Premium", "PremiumPlus"];

export type PublishCapability = {
  subscription: SubscriptionType | null;
  checked: boolean;
  standardPostLimit: number;
  maximum: number;
  longForm: boolean;
  automaticThreadPublishing: false;
};

export function parseSubscriptionType(value: unknown): SubscriptionType | null {
  if (typeof value !== "string") return null;
  return subscriptionTypes.find((item) => item === value) ?? null;
}

export function capabilityForSubscription(input: { subscription: string | null; checkedAt: string | null }): PublishCapability {
  const subscription = input.checkedAt ? parseSubscriptionType(input.subscription) : null;
  const longForm = subscription !== null && longFormEntitlements.includes(subscription);
  return {
    subscription,
    checked: Boolean(input.checkedAt),
    standardPostLimit,
    maximum: longForm ? longFormPostLimit : standardPostLimit,
    longForm,
    automaticThreadPublishing: false,
  };
}

export const uncheckedCapability = capabilityForSubscription({ subscription: null, checkedAt: null });

export function textFits(text: string, capability: PublishCapability) {
  const count = characterCount(text);
  if (count < 1) return { ok: false as const, maximum: capability.maximum, reason: "The final post is empty." };
  if (count > capability.maximum) {
    return {
      ok: false as const,
      maximum: capability.maximum,
      reason: `The post must be 1–${capability.maximum} characters.`,
    };
  }
  return { ok: true as const, maximum: capability.maximum, text };
}

export const urlPriceNote = "Publishing a post that contains a URL can be priced differently from a post without one.";
