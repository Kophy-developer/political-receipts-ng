import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const blockedNames = new Set(["localhost", "metadata.google.internal", "metadata.google.com", "metadata"]);

export function blockedIp(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : value;
  if (!isIP(v4) || v4.includes(":")) return value.includes(":") ? false : true;
  const [a, b] = v4.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false as const, message: "That URL could not be read." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false as const, message: "Only http and https URLs can be retrieved." };
  if (url.username || url.password) return { ok: false as const, message: "A URL with a username or password is not retrieved." };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false as const, message: "Only the standard web ports are retrieved." };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (blockedNames.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false as const, message: "That host is not retrieved." };
  }
  if (isIP(host) && blockedIp(host)) return { ok: false as const, message: "That address is not retrieved." };
  if (!isIP(host)) {
    let records: Array<{ address: string }>;
    try {
      records = await lookup(host, { all: true, verbatim: true });
    } catch {
      return { ok: false as const, message: "The host did not resolve." };
    }
    if (records.length === 0 || records.some((record) => blockedIp(record.address))) {
      return { ok: false as const, message: "That host resolves to an address the desk will not retrieve." };
    }
  }
  return { ok: true as const, url };
}
