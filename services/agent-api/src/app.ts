import {
  LIVE_SESSION_MAX_SDP_LENGTH,
  validateLiveSessionRequest,
  type ApiErrorCode,
  type ApiErrorResponse,
} from "@tulu/shared";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentApiConfig } from "./config.js";
import type { LiveSessionClient } from "./live/live-session-client.js";
import { handleOperationsRequest } from "./operations/http.js";
import {
  createSyntheticOperationalRepository,
  type SyntheticOperationalRepository,
} from "./operations/repository.js";
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
  rateLimiter?: FixedWindowRateLimiter;
  operationsRateLimiter?: FixedWindowRateLimiter;
  operationsRepository?: SyntheticOperationalRepository;
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
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
  rateLimiter = new FixedWindowRateLimiter(
    config.rateLimitMax,
    config.rateLimitWindowMs,
  ),
  operationsRateLimiter = new FixedWindowRateLimiter(
    config.operationsRateLimitMax,
    config.operationsRateLimitWindowMs,
  ),
  operationsRepository = createSyntheticOperationalRepository(),
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

      if (
        await handleOperationsRequest({
          request,
          response,
          url,
          requestId,
          clientAddress: clientAddress(request, config.trustProxy),
          allowedOrigins: config.operationsAllowedOrigins,
          repository: operationsRepository,
          rateLimiter: operationsRateLimiter,
          logger,
        })
      ) {
        return;
      }

      if (url.pathname !== "/api/live/sessions") {
        sendError(response, 404, "not_found", "Route not found.", requestId);
        return;
      }

      const origin = requestOrigin(request);
      if (!origin || !config.allowedOrigins.has(origin)) {
        sendError(
          response,
          403,
          "origin_forbidden",
          "Unexpected request origin.",
          requestId,
        );
        return;
      }
      const allowedCorsHeaders = corsHeaders(origin);
      safeResponseHeaders = allowedCorsHeaders;

      if (request.method === "OPTIONS") {
        response.writeHead(204, allowedCorsHeaders);
        response.end();
        return;
      }

      if (request.method !== "POST") {
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
        backendInstructions: buildBackendPrompt(validated.data.language),
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
