import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function serviceClient() {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    cached = null;
    return cached;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

export function scrubDbMessage(message: string) {
  if (/bearer|token|secret|api[_ -]?key|authorization|password|service_role/i.test(message)) {
    return "The database rejected the request.";
  }
  return "The database could not complete that request.";
}

export function schemaMissing(message: string) {
  return /schema cache|does not exist|could not find the table|42P01|PGRST205/i.test(message);
}
