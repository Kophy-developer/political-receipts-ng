import "server-only";
import { geminiConfigured, geminiLabel, geminiModelName } from "@/lib/ai/env";
import { geminiProvider } from "@/lib/ai/gemini";
import type { AiProvider } from "@/lib/ai/types";

export { geminiConfigured, geminiLabel, geminiModelName };
export type { AiJsonResult, AiProvider, AiUsage } from "@/lib/ai/types";

export function aiProvider(): AiProvider | null {
  if (!geminiConfigured()) return null;
  return geminiProvider();
}
