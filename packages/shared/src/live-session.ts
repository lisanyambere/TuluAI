export const supportedLanguages = ["en", "sw"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const LIVE_SESSION_MAX_SDP_LENGTH = 64 * 1024;

export interface LiveSessionRequest {
  sdp: string;
  language: SupportedLanguage;
  consentAcknowledged: true;
}

export interface LiveSessionResponse {
  session: {
    id: string;
  };
  transport: {
    type: "webrtc";
    sdp: string;
  };
}

export type ApiErrorCode =
  | "internal_error"
  | "invalid_request"
  | "method_not_allowed"
  | "not_found"
  | "origin_forbidden"
  | "payload_too_large"
  | "rate_limited"
  | "unsupported_media_type"
  | "upstream_error";

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    issues?: readonly string[];
  };
}

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateLiveSessionRequest(
  value: unknown,
): ValidationResult<LiveSessionRequest> {
  if (!isRecord(value)) {
    return { success: false, issues: ["body must be a JSON object"] };
  }

  const issues: string[] = [];
  const allowedKeys = new Set(["sdp", "language", "consentAcknowledged"]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`unexpected field: ${key}`);
  }

  if (typeof value.sdp !== "string" || value.sdp.trim().length === 0) {
    issues.push("sdp must be a non-empty string");
  } else if (value.sdp.length > LIVE_SESSION_MAX_SDP_LENGTH) {
    issues.push(`sdp must not exceed ${LIVE_SESSION_MAX_SDP_LENGTH} characters`);
  }

  if (
    typeof value.language !== "string" ||
    !supportedLanguages.includes(value.language as SupportedLanguage)
  ) {
    issues.push('language must be either "en" or "sw"');
  }

  if (value.consentAcknowledged !== true) {
    issues.push("consentAcknowledged must be true");
  }

  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    data: {
      sdp: value.sdp as string,
      language: value.language as SupportedLanguage,
      consentAcknowledged: true,
    },
  };
}

export function validateLiveSessionResponse(
  value: unknown,
): ValidationResult<LiveSessionResponse> {
  if (!isRecord(value) || !isRecord(value.session) || !isRecord(value.transport)) {
    return { success: false, issues: ["invalid Live session response shape"] };
  }

  const issues: string[] = [];
  if (typeof value.session.id !== "string" || value.session.id.length === 0) {
    issues.push("session.id must be a non-empty string");
  }
  if (value.transport.type !== "webrtc") {
    issues.push('transport.type must be "webrtc"');
  }
  if (typeof value.transport.sdp !== "string" || value.transport.sdp.length === 0) {
    issues.push("transport.sdp must be a non-empty string");
  }

  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    data: {
      session: { id: value.session.id as string },
      transport: {
        type: "webrtc",
        sdp: value.transport.sdp as string,
      },
    },
  };
}
