import {
  LIVE_SESSION_MAX_SDP_LENGTH,
  REQUEST_STATUSES,
  validateLiveSessionRequest,
  type ApiErrorCode,
  type ApiErrorResponse,
  type DashboardCommand,
  type DashboardState,
} from "@tulu/shared";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentApiConfig } from "./config.js";
import type { LiveSessionClient } from "./live/live-session-client.js";
import { buildBackendPrompt } from "./prompts/backend-prompt.js";
import { buildLivePrompt } from "./prompts/live-prompt.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

const JSON_BODY_LIMIT_BYTES = LIVE_SESSION_MAX_SDP_LENGTH + 2_048;

export interface SafeLogger {
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface AppDependencies {
  config: AgentApiConfig;
  liveSessionClient: LiveSessionClient;
  dashboardStore?: {
    getState(): DashboardState;
    applyCommand(command: DashboardCommand): DashboardState;
  };
  toolsEnabled?: boolean;
  rateLimiter?: FixedWindowRateLimiter;
  logger?: SafeLogger;
}

class PayloadTooLargeError extends Error {}
class InvalidJsonError extends Error {}

const defaultLogger: SafeLogger = {
  info: (message, context) => console.info(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {}),
};

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  status: number,
  code: ApiErrorCode,
  message: string,
  requestId: string,
  issues?: readonly string[],
  headers: Readonly<Record<string, string>> = {},
): void {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      requestId,
      ...(issues ? { issues } : {}),
    },
  };
  sendJson(response, status, body, headers);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseDashboardCommand(value: unknown): DashboardCommand | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;

  if (value.type === "update_facility" && isRecord(value.updates)) {
    const updates = Object.fromEntries(
      ["location", "openingHours", "services"]
        .filter((key) => typeof value.updates[key] === "string")
        .map((key) => [key, value.updates[key]]),
    );
    return { type: value.type, updates };
  }

  if (typeof value.id !== "string" || !value.id.trim()) return undefined;
  if (
    value.type === "set_status" &&
    typeof value.status === "string" &&
    REQUEST_STATUSES.includes(
      value.status as (typeof REQUEST_STATUSES)[number],
    ) &&
    typeof value.action === "string"
  ) {
    return {
      type: value.type,
      id: value.id,
      status: value.status as (typeof REQUEST_STATUSES)[number],
      action: value.action,
    };
  }
  if (value.type === "confirm_request" || value.type === "reject_request") {
    return { type: value.type, id: value.id };
  }
  if (value.type === "assign_request") {
    if (value.assignee !== undefined && typeof value.assignee !== "string") {
      return undefined;
    }
    return {
      type: value.type,
      id: value.id,
      ...(value.assignee ? { assignee: value.assignee } : {}),
    };
  }
  if (value.type === "add_note" && typeof value.body === "string") {
    return { type: value.type, id: value.id, body: value.body };
  }
  return undefined;
}

function requestOrigin(request: IncomingMessage): string | undefined {
  const origin = request.headers.origin;
  return Array.isArray(origin) ? origin[0] : origin;
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = value?.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? "unknown";
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = request.headers["content-length"];
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      throw new InvalidJsonError();
    }
    if (declaredLength > JSON_BODY_LIMIT_BYTES) {
      throw new PayloadTooLargeError();
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > JSON_BODY_LIMIT_BYTES) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidJsonError();
  }
}

export function createApiHandler({
  config,
  liveSessionClient,
  dashboardStore,
  toolsEnabled = false,
  rateLimiter = new FixedWindowRateLimiter(
    config.rateLimitMax,
    config.rateLimitWindowMs,
  ),
  logger = defaultLogger,
}: AppDependencies) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const requestId = randomUUID();
    let safeResponseHeaders: Readonly<Record<string, string>> = {};
    response.setHeader("X-Request-Id", requestId);

    try {
      const url = new URL(request.url ?? "/", "http://agent-api.local");

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { status: "ok", service: "tulu-agent-api" });
        return;
      }

      const isLiveSessionRoute = url.pathname === "/api/live/sessions";
      const isDashboardStateRoute = url.pathname === "/api/dashboard/state";
      const isDashboardCommandRoute =
        url.pathname === "/api/dashboard/commands";
      if (
        !isLiveSessionRoute &&
        !isDashboardStateRoute &&
        !isDashboardCommandRoute
      ) {
        sendError(response, 404, "not_found", "Route not found.", requestId);
        return;
      }

      const origin = requestOrigin(request);
      const isDashboardRoute =
        isDashboardStateRoute || isDashboardCommandRoute;
      const remoteAddress = request.socket.remoteAddress;
      const isLocalDashboardProxy =
        isDashboardRoute &&
        !origin &&
        (remoteAddress === "127.0.0.1" ||
          remoteAddress === "::1" ||
          remoteAddress === "::ffff:127.0.0.1");
      if (
        !isLocalDashboardProxy &&
        (!origin || !config.allowedOrigins.has(origin))
      ) {
        sendError(
          response,
          403,
          "origin_forbidden",
          "Unexpected request origin.",
          requestId,
        );
        return;
      }
      const allowedCorsHeaders = origin ? corsHeaders(origin) : {};
      safeResponseHeaders = allowedCorsHeaders;

      if (request.method === "OPTIONS") {
        response.writeHead(204, allowedCorsHeaders);
        response.end();
        return;
      }

      if (
        isDashboardStateRoute &&
        request.method === "GET" &&
        dashboardStore
      ) {
        sendJson(response, 200, dashboardStore.getState(), allowedCorsHeaders);
        return;
      }

      if (
        isDashboardCommandRoute &&
        request.method === "POST" &&
        dashboardStore
      ) {
        if (
          request.headers["content-type"]
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        ) {
          sendError(
            response,
            415,
            "unsupported_media_type",
            "Content-Type must be application/json.",
            requestId,
            undefined,
            allowedCorsHeaders,
          );
          return;
        }

        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          sendError(
            response,
            400,
            "invalid_request",
            "Request body must be valid JSON.",
            requestId,
            undefined,
            allowedCorsHeaders,
          );
          return;
        }
        const command = parseDashboardCommand(body);
        if (!command) {
          sendError(
            response,
            400,
            "invalid_request",
            "Invalid dashboard command.",
            requestId,
            undefined,
            allowedCorsHeaders,
          );
          return;
        }
        sendJson(
          response,
          200,
          dashboardStore.applyCommand(command),
          allowedCorsHeaders,
        );
        return;
      }

      if (!isLiveSessionRoute || request.method !== "POST") {
        sendError(
          response,
          405,
          "method_not_allowed",
          "Method not allowed.",
          requestId,
          undefined,
          { ...allowedCorsHeaders, Allow: "POST, OPTIONS" },
        );
        return;
      }

      const rateLimit = rateLimiter.consume(
        clientAddress(request, config.trustProxy),
      );
      const rateHeaders = {
        ...allowedCorsHeaders,
        "RateLimit-Limit": String(rateLimit.limit),
        "RateLimit-Remaining": String(rateLimit.remaining),
        "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1_000)),
      };
      if (!rateLimit.allowed) {
        sendError(
          response,
          429,
          "rate_limited",
          "Too many session requests. Please try again shortly.",
          requestId,
          undefined,
          {
            ...rateHeaders,
            "Retry-After": String(
              Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000)),
            ),
          },
        );
        return;
      }

      if (
        request.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase() !== "application/json"
      ) {
        sendError(
          response,
          415,
          "unsupported_media_type",
          "Content-Type must be application/json.",
          requestId,
          undefined,
          rateHeaders,
        );
        return;
      }

      let body: unknown;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendError(
            response,
            413,
            "payload_too_large",
            "Request body is too large.",
            requestId,
            undefined,
            rateHeaders,
          );
          return;
        }
        sendError(
          response,
          400,
          "invalid_request",
          "Request body must be valid JSON.",
          requestId,
          undefined,
          rateHeaders,
        );
        return;
      }

      const validated = validateLiveSessionRequest(body);
      if (!validated.success) {
        sendError(
          response,
          400,
          "invalid_request",
          "Invalid Live session request.",
          requestId,
          validated.issues,
          rateHeaders,
        );
        return;
      }

      const result = await liveSessionClient.create({
        sdp: validated.data.sdp,
        language: validated.data.language,
        liveModel: config.liveModel,
        backendModel: config.backendModel,
        liveInstructions: buildLivePrompt(validated.data.language),
        backendInstructions: buildBackendPrompt(
          validated.data.language,
          toolsEnabled,
        ),
      });

      logger.info("Live session created", {
        requestId,
        language: validated.data.language,
      });
      sendJson(response, 201, result, rateHeaders);
    } catch {
      logger.error("Live session creation failed", { requestId });
      if (!response.headersSent) {
        sendError(
          response,
          502,
          "upstream_error",
          "Live session creation failed.",
          requestId,
          undefined,
          safeResponseHeaders,
        );
      } else {
        response.end();
      }
    }
  };
}
