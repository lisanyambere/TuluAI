import type {
  ApiErrorCode,
  ApiErrorResponse,
  OperationalSnapshot,
} from "@tulu/shared";
import type { IncomingMessage, ServerResponse } from "node:http";

import { FixedWindowRateLimiter } from "../rate-limit.js";
import {
  InvalidOperationalQueryError,
  type SyntheticOperationalRepository,
} from "./repository.js";
import {
  SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT,
  syntheticFacilities,
  syntheticInventory,
  syntheticServiceAvailability,
} from "./synthetic-data.js";

const OPERATIONS_PREFIX = "/api/v1/operations";
const DATASET_VERSION = "1";

const routes = new Set([
  `${OPERATIONS_PREFIX}/snapshot`,
  `${OPERATIONS_PREFIX}/facilities`,
  `${OPERATIONS_PREFIX}/service-availability`,
  `${OPERATIONS_PREFIX}/inventory`,
]);

export interface OperationsHttpLogger {
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface OperationsHttpContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  requestId: string;
  clientAddress: string;
  allowedOrigins: ReadonlySet<string>;
  repository: SyntheticOperationalRepository;
  rateLimiter: FixedWindowRateLimiter;
  logger: OperationsHttpLogger;
}

function requestOrigin(request: IncomingMessage): string | undefined {
  const origin = request.headers.origin;
  return Array.isArray(origin) ? origin[0] : origin;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function dataHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, max-age=15, must-revalidate",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Tulu-Data-Mode": "synthetic",
    "X-Tulu-Dataset-Version": DATASET_VERSION,
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, { ...dataHeaders(), ...headers });
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
    error: { code, message, requestId, ...(issues ? { issues } : {}) },
  };
  sendJson(response, status, body, {
    "Cache-Control": "no-store",
    ...headers,
  });
}

function parseQuery(
  searchParams: URLSearchParams,
  allowed: readonly string[],
): { values: Record<string, string>; issues: string[] } {
  const allowedSet = new Set(allowed);
  const values: Record<string, string> = {};
  const issues: string[] = [];

  for (const key of new Set(searchParams.keys())) {
    const entries = searchParams.getAll(key);
    if (!allowedSet.has(key)) {
      issues.push(`unexpected query parameter: ${key}`);
      continue;
    }
    if (entries.length !== 1) {
      issues.push(`query parameter must appear once: ${key}`);
      continue;
    }
    const value = entries[0];
    if (value !== undefined) values[key] = value;
  }

  return { values, issues: issues.sort() };
}

function syntheticSnapshot(): OperationalSnapshot {
  return {
    synthetic: true,
    verifiedAt: SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT,
    datasetVersion: DATASET_VERSION,
    facilities: syntheticFacilities,
    services: syntheticServiceAvailability,
    inventory: syntheticInventory,
  };
}

export async function handleOperationsRequest(
  context: OperationsHttpContext,
): Promise<boolean> {
  const {
    request,
    response,
    url,
    requestId,
    repository,
    rateLimiter,
    logger,
  } = context;

  if (!url.pathname.startsWith(`${OPERATIONS_PREFIX}/`)) return false;

  const origin = requestOrigin(request);
  if (origin && !context.allowedOrigins.has(origin)) {
    sendError(
      response,
      403,
      "origin_forbidden",
      "Unexpected request origin.",
      requestId,
    );
    return true;
  }
  const allowedCorsHeaders = origin ? corsHeaders(origin) : {};

  if (!routes.has(url.pathname)) {
    sendError(
      response,
      404,
      "not_found",
      "Route not found.",
      requestId,
      undefined,
      allowedCorsHeaders,
    );
    return true;
  }

  if (request.method === "OPTIONS") {
    if (!origin) {
      sendError(
        response,
        403,
        "origin_forbidden",
        "An approved browser origin is required for preflight.",
        requestId,
      );
      return true;
    }
    response.writeHead(204, {
      ...allowedCorsHeaders,
      "X-Content-Type-Options": "nosniff",
    });
    response.end();
    return true;
  }

  if (request.method !== "GET") {
    sendError(
      response,
      405,
      "method_not_allowed",
      "Method not allowed.",
      requestId,
      undefined,
      { ...allowedCorsHeaders, Allow: "GET, OPTIONS" },
    );
    return true;
  }

  const rateLimit = rateLimiter.consume(context.clientAddress);
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
      "Too many operations requests. Please try again shortly.",
      requestId,
      undefined,
      {
        ...rateHeaders,
        "Retry-After": String(
          Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000)),
        ),
      },
    );
    return true;
  }

  try {
    let result: unknown;

    if (url.pathname === `${OPERATIONS_PREFIX}/snapshot`) {
      const parsed = parseQuery(url.searchParams, []);
      if (parsed.issues.length > 0) {
        throw new InvalidOperationalQueryError("find_facilities", parsed.issues);
      }
      result = syntheticSnapshot();
    } else if (url.pathname === `${OPERATIONS_PREFIX}/facilities`) {
      const parsed = parseQuery(url.searchParams, ["query", "limit"]);
      if (parsed.issues.length > 0) {
        throw new InvalidOperationalQueryError("find_facilities", parsed.issues);
      }
      result = repository.find_facilities({
        ...(parsed.values.query !== undefined
          ? { query: parsed.values.query }
          : {}),
        ...(parsed.values.limit !== undefined
          ? { limit: Number(parsed.values.limit) }
          : {}),
      });
    } else if (url.pathname === `${OPERATIONS_PREFIX}/service-availability`) {
      const parsed = parseQuery(url.searchParams, [
        "service",
        "facilityId",
        "location",
      ]);
      if (parsed.issues.length > 0) {
        throw new InvalidOperationalQueryError(
          "check_service_availability",
          parsed.issues,
        );
      }
      result = repository.check_service_availability(parsed.values);
    } else {
      const parsed = parseQuery(url.searchParams, [
        "item",
        "facilityId",
        "location",
      ]);
      if (parsed.issues.length > 0) {
        throw new InvalidOperationalQueryError("check_inventory", parsed.issues);
      }
      result = repository.check_inventory(parsed.values);
    }

    logger.info("Synthetic operations lookup completed", {
      requestId,
      route: url.pathname,
    });
    sendJson(response, 200, result, rateHeaders);
  } catch (error) {
    if (error instanceof InvalidOperationalQueryError) {
      sendError(
        response,
        400,
        "invalid_request",
        "Invalid query parameters.",
        requestId,
        error.issues,
        rateHeaders,
      );
      return true;
    }

    logger.error("Synthetic operations lookup failed", {
      requestId,
      route: url.pathname,
    });
    sendError(
      response,
      500,
      "internal_error",
      "The operations lookup failed.",
      requestId,
      undefined,
      rateHeaders,
    );
  }

  return true;
}
