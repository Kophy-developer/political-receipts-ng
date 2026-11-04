/**
 * Provider failure diagnostics. No network calls and no credentials.
 * Secret-shaped text is redacted. Ordinary words such as "invalid_api_key" stay.
 */

export const FAILURE_CLASSES = [
  "AUTHENTICATION_FAILED",
  "MODEL_NOT_FOUND",
  "MODEL_NOT_AVAILABLE_FOR_ACCOUNT",
  "RATE_LIMITED",
  "DAILY_LIMIT_REACHED",
  "TOKEN_LIMIT",
  "BAD_REQUEST",
  "TIMEOUT",
  "NETWORK_ERROR",
  "PROVIDER_SERVER_ERROR",
  "INVALID_RESPONSE",
  "UNKNOWN_PROVIDER_ERROR",
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

export type DeskStatus =
  | "CREDENTIAL CONFIGURED"
  | "UNVERIFIED"
  | "AVAILABLE"
  | "RATE LIMITED"
  | "UNAVAILABLE"
  | "AUTH ERROR"
  | "DAILY APP LIMIT REACHED";

export type ResponseShape = {
  envelope: string;
  choiceCount: number;
  finishReason: string | null;
  contentType: string;
  contentLength: number;
  contentPreview: string | null;
};

export type ProviderDiagnostic = {
  classification: FailureClass;
  httpStatus: number | null;
  providerCode: string | null;
  providerType: string | null;
  message: string | null;
  requestId: string | null;
  rateLimit: Record<string, string> | null;
  endpoint: string;
  model: string;
  shape: ResponseShape | null;
};

const ORIGINAL_NOT_RETAINED = "Original provider error was not retained.";

export function sanitizeProviderMessage(message: string) {
  const cleaned = message
    .replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "bearer [redacted]")
    .replace(/\b(?:sk|gsk|rk|pk|or|AIza)[_-]?[A-Za-z0-9\-._]{12,}\b/g, "[redacted]")
    .replace(/(?:api[_ -]?key|token|authorization|cookie)\s*[:=]\s*\S+/gi, (match) => match.replace(/[:=]\s*\S+/, ": [redacted]"))
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 300);
}

function shortHeader(value: string) {
  const clean = sanitizeProviderMessage(value);
  return clean.slice(0, 80);
}

export function readProviderHeaders(headers: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  const requestId = ["x-request-id", "x-groq-request-id", "x-openrouter-request-id", "request-id", "x-requestid"]
    .map((name) => lower[name])
    .find((value) => typeof value === "string" && value.trim());
  const rateLimit: Record<string, string> = {};
  for (const [key, value] of Object.entries(lower)) {
    if (key === "retry-after" || key.startsWith("x-ratelimit") || key.startsWith("ratelimit")) {
      const safe = shortHeader(value);
      if (safe) rateLimit[key] = safe;
    }
  }
  return {
    requestId: requestId ? shortHeader(requestId) : null,
    rateLimit: Object.keys(rateLimit).length ? rateLimit : null,
  };
}

function errorParts(body: unknown) {
  if (!body || typeof body !== "object") return { message: null as string | null, code: null as string | null, type: null as string | null };
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return { message: error, code: null, type: null };
  if (!error || typeof error !== "object") return { message: null, code: null, type: null };
  const record = error as { message?: unknown; code?: unknown; type?: unknown; status?: unknown };
  const code = record.code == null ? null : String(record.code).slice(0, 80);
  const type = typeof record.type === "string" ? record.type.slice(0, 80) : typeof record.status === "string" ? record.status.slice(0, 80) : null;
  const message = typeof record.message === "string" ? record.message : null;
  return { message, code, type };
}

export function classifyProviderFailure(input: {
  httpStatus: number | null;
  body?: unknown;
  network?: "timeout" | "network" | null;
  invalidResponse?: boolean;
}) {
  const parts = errorParts(input.body);
  const blob = `${parts.code ?? ""} ${parts.type ?? ""} ${parts.message ?? ""}`.toLowerCase();
  let classification: FailureClass = "UNKNOWN_PROVIDER_ERROR";
  if (input.network === "timeout" || input.httpStatus === 408 || input.httpStatus === 504) classification = "TIMEOUT";
  else if (input.network === "network") classification = "NETWORK_ERROR";
  else if (input.invalidResponse) classification = "INVALID_RESPONSE";
  else if (input.httpStatus === 401 || input.httpStatus === 403) classification = "AUTHENTICATION_FAILED";
  else if (input.httpStatus === 404 || /model_not_found|unknown model|model .{0,40}not found|does not exist/.test(blob)) classification = "MODEL_NOT_FOUND";
  else if (/not available for|does not have access|no access to (the )?model|model_not_available|permission/.test(blob)) classification = "MODEL_NOT_AVAILABLE_FOR_ACCOUNT";
  else if (input.httpStatus === 429 && /daily|per day|\brpd\b|\btpd\b|quota|requests per day|tokens per day/.test(blob)) classification = "DAILY_LIMIT_REACHED";
  else if (input.httpStatus === 429) classification = "RATE_LIMITED";
  else if (input.httpStatus === 413 || /context length|maximum context|too many tokens|token limit|max(?:imum)? tokens/.test(blob)) classification = "TOKEN_LIMIT";
  else if (input.httpStatus != null && input.httpStatus >= 500) classification = "PROVIDER_SERVER_ERROR";
  else if (input.httpStatus === 400 || input.httpStatus === 422) classification = "BAD_REQUEST";
  return {
    classification,
    providerCode: parts.code,
    providerType: parts.type,
    message: parts.message ? sanitizeProviderMessage(parts.message) : null,
  };
}

export function buildDiagnostic(input: {
  httpStatus: number | null;
  body?: unknown;
  headers?: Record<string, string>;
  endpoint: string;
  model: string;
  network?: "timeout" | "network" | null;
  invalidResponse?: boolean;
  message?: string | null;
  shape?: ResponseShape | null;
}): ProviderDiagnostic {
  const classified = classifyProviderFailure(input);
  const headers = readProviderHeaders(input.headers ?? {});
  return {
    classification: classified.classification,
    httpStatus: input.httpStatus,
    providerCode: classified.providerCode,
    providerType: classified.providerType,
    message: input.message ? sanitizeProviderMessage(input.message) : classified.message,
    requestId: headers.requestId,
    rateLimit: headers.rateLimit,
    endpoint: input.endpoint,
    model: input.model,
    shape: input.shape ?? null,
  };
}

export function editorMessage(diagnostic: ProviderDiagnostic) {
  const rate = diagnostic.rateLimit
    ? Object.entries(diagnostic.rateLimit).map(([key, value]) => `${key}=${value}`).join(", ")
    : null;
  return [
    diagnostic.classification,
    diagnostic.httpStatus != null ? `HTTP ${diagnostic.httpStatus}` : null,
    diagnostic.providerCode,
    diagnostic.providerType,
    diagnostic.message,
    diagnostic.requestId ? `Request ${diagnostic.requestId}` : null,
    rate ? `Rate limit ${rate}` : null,
    `Endpoint ${diagnostic.endpoint}`,
    `Model ${diagnostic.model}`,
    diagnostic.shape
      ? `Envelope ${diagnostic.shape.envelope}. Choices ${diagnostic.shape.choiceCount}. Finish ${diagnostic.shape.finishReason ?? "none"}. Content ${diagnostic.shape.contentType}, ${diagnostic.shape.contentLength} characters.${diagnostic.shape.contentPreview ? ` Preview ${diagnostic.shape.contentPreview}` : ""}`
      : null,
  ].filter((part) => part && part.trim()).join(". ");
}

export function statusForClassification(classification: FailureClass): DeskStatus {
  if (classification === "AUTHENTICATION_FAILED") return "AUTH ERROR";
  if (classification === "RATE_LIMITED" || classification === "DAILY_LIMIT_REACHED") return "RATE LIMITED";
  if (
    classification === "MODEL_NOT_FOUND"
    || classification === "MODEL_NOT_AVAILABLE_FOR_ACCOUNT"
    || classification === "PROVIDER_SERVER_ERROR"
    || classification === "NETWORK_ERROR"
  ) {
    return "UNAVAILABLE";
  }
  return "UNVERIFIED";
}

export function retainedFailure(reason: string | null, diagnostic: ProviderDiagnostic | null) {
  if (diagnostic) {
    return { status: statusForClassification(diagnostic.classification), text: editorMessage(diagnostic), retained: true };
  }
  if (reason === "unavailable") return { status: "UNVERIFIED" as const, text: ORIGINAL_NOT_RETAINED, retained: false };
  if (reason === "timed out") return { status: "UNVERIFIED" as const, text: "TIMEOUT. The earlier log did not keep the provider response.", retained: false };
  if (reason === "malformed output") return { status: "UNVERIFIED" as const, text: "INVALID_RESPONSE. The earlier log did not keep the provider response.", retained: false };
  if (reason) return { status: "UNVERIFIED" as const, text: sanitizeProviderMessage(reason), retained: false };
  return null;
}

export function shownProviderStatus(input: {
  credential: boolean;
  callable: boolean;
  skipReason: string | null;
  used: number;
  limit: number;
  latest: { status: "success" | "failure" | "rejected"; reason: string | null; diagnostic: ProviderDiagnostic | null } | null;
}): DeskStatus {
  if (!input.credential || input.skipReason === "no credential" || input.skipReason === "configured model is not usable" || input.skipReason === "paid route blocked") {
    return "UNAVAILABLE";
  }
  if (input.skipReason === "daily allowance exhausted" || input.used >= input.limit) return "DAILY APP LIMIT REACHED";
  if (!input.latest) return "CREDENTIAL CONFIGURED";
  if (input.latest.status === "success" || input.latest.status === "rejected") return "AVAILABLE";
  return retainedFailure(input.latest.reason, input.latest.diagnostic)?.status ?? "UNVERIFIED";
}
