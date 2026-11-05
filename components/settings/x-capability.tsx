import { documentedLongPostLimit, longPostUnknownCopy, standardPostLimit } from "@/lib/publish/capability";

export function XCapability({ username }: { username: string | null }) {
  return (
    <div className="mt-6 max-w-2xl border border-rule px-4 py-4">
      <p className="font-mono text-[10px] tracking-[0.16em] text-ink-soft uppercase">Publishing capability</p>
      <p className="mt-2 text-sm leading-relaxed">{longPostUnknownCopy}</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-ink-soft">Standard posts</dt>
          <dd>Supported. One post, up to {standardPostLimit} characters, through POST /2/tweets.</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Long posts</dt>
          <dd>Not verified. The official changelog says the same endpoint can create a {documentedLongPostLimit.toLocaleString("en-US")}-character post. This desk does not send one.</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Thread publishing</dt>
          <dd>Not available. The create endpoint accepts a reply id, and the manage-posts guide limits self-serve replies. This desk sends one post.</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Media</dt>
          <dd>Not used. The create endpoint can attach uploaded media. PRNG does not.</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Connected account</dt>
          <dd>{username ? `@${username}` : "No stored account"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Subscription tier</dt>
          <dd>Not read. The user field exists. PRNG does not request it, and this page does not name a tier.</dd>
        </div>
      </dl>
    </div>
  );
}
