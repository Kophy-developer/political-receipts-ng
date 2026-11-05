import { chicagoStamp } from "@/lib/format";
import { capabilityForSubscription, longFormPostLimit, standardPostLimit, urlPriceNote } from "@/lib/publish/capability";

export function XCapability({
  username,
  subscriptionType,
  checkedAt,
}: {
  username: string | null;
  subscriptionType: string | null;
  checkedAt: string | null;
}) {
  const capability = capabilityForSubscription({ subscription: subscriptionType, checkedAt });
  const subscription = !capability.checked ? "Not checked" : capability.subscription ?? "Not returned";
  const longForm = !capability.checked
    ? "Not available until the subscription is checked."
    : capability.longForm
      ? `Available, up to ${longFormPostLimit.toLocaleString("en-US")} characters, on the same create endpoint.`
      : "Not available for this subscription.";
  return (
    <div className="mt-6 max-w-2xl border border-rule px-4 py-4">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-ink-soft">Connected account</dt>
          <dd>{username ? `@${username}` : "No stored account"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Subscription</dt>
          <dd>{subscription}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Last checked</dt>
          <dd>{checkedAt ? chicagoStamp(checkedAt) : "Not checked"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Standard posts</dt>
          <dd>Available, up to {standardPostLimit} characters.</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Long-form posts</dt>
          <dd>{longForm}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Thread publishing</dt>
          <dd>Automatic thread publishing: Not enabled.</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{urlPriceNote} Source links are not added to the post.</p>
    </div>
  );
}
