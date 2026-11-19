import "server-only";
import { assertPublicUrl } from "@/lib/research/ssrf";
import { xUserMultipart } from "@/lib/x/oauth1";

const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
const maxBytes = 5 * 1024 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

export async function fetchPublicImage(raw: string) {
  const checked = await assertPublicUrl(raw);
  if (!checked.ok) return checked;
  if (checked.url.protocol !== "https:") {
    return { ok: false as const, message: "Evidence images have to be retrieved over https." };
  }
  let current = checked.url;
  for (let hop = 0; hop < 3; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { accept: "image/jpeg,image/png,image/webp,image/gif" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return { ok: false as const, message: "The evidence image did not answer." };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false as const, message: "The evidence image redirected without a destination." };
      const next = await assertPublicUrl(new URL(location, current).toString());
      if (!next.ok) return next;
      if (next.url.protocol !== "https:") {
        return { ok: false as const, message: "Evidence images have to be retrieved over https." };
      }
      current = next.url;
      continue;
    }
    if (!response.ok) return { ok: false as const, message: `The evidence image returned ${response.status}.` };
    const type = (response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase() || "";
    if (!allowed.has(type)) {
      return { ok: false as const, message: "Attach a JPEG, PNG, WebP, or GIF image URL." };
    }
    const length = Number(response.headers.get("content-length") || "0");
    if (length > maxBytes) return { ok: false as const, message: "That image is larger than 5 MB." };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 32) return { ok: false as const, message: "That image file is empty." };
    if (buffer.byteLength > maxBytes) return { ok: false as const, message: "That image is larger than 5 MB." };
    return { ok: true as const, bytes: buffer, contentType: type, fileName: `evidence.${extensionFor(type)}` };
  }
  return { ok: false as const, message: "The evidence image redirected too many times." };
}

export async function uploadEvidenceImage(raw: string) {
  const image = await fetchPublicImage(raw);
  if (!image.ok) return image;
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(image.bytes)], { type: image.contentType }), image.fileName);
  const uploaded = await xUserMultipart(uploadUrl, form);
  if (!uploaded.ok) return uploaded;
  const mediaId = (uploaded.data as { media_id_string?: unknown; media_id?: unknown }).media_id_string
    ?? (uploaded.data as { media_id?: unknown }).media_id;
  const id = typeof mediaId === "string" ? mediaId : typeof mediaId === "number" ? String(mediaId) : "";
  if (!/^\d+$/.test(id)) {
    return { ok: false as const, status: 502, message: "X did not return a media id." };
  }
  return { ok: true as const, mediaId: id };
}
