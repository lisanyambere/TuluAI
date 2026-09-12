import {
  effectiveVerificationStatus,
  type VerificationStatus,
} from "@tulu/shared";
import type { FunctionTool } from "openai/resources/live/live";

import {
  InvalidOperationalQueryError,
  type SyntheticOperationalRepository,
} from "./repository.js";

export const operationalToolDefinitions = [
  {
    type: "function",
    name: "find_facilities",
    description:
      "Search the fixed Tulu synthetic demonstration directory for facilities. Use before making any facility-name or location claim. All returned records are fictional demo records, not real facilities.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: ["string", "null"],
          description:
            "Optional facility name, locality, region, type, or identifier to match.",
          minLength: 1,
          maxLength: 120,
        },
        limit: {
          type: ["integer", "null"],
          description: "Maximum number of results, from 1 to 20.",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query", "limit"],
    },
    strict: true,
  },
  {
    type: "function",
    name: "check_service_availability",
    description:
      "Check a named service in the fixed Tulu synthetic demonstration dataset. Use for every availability claim. Never describe the result as current real-world facility availability.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        service: {
          type: "string",
          description:
            "The service to find, such as general consultation or maternal health.",
          minLength: 1,
          maxLength: 120,
        },
        facilityId: {
          type: ["string", "null"],
          description: "Optional exact facility identifier from find_facilities.",
          minLength: 1,
          maxLength: 80,
        },
        location: {
          type: ["string", "null"],
          description: "Optional locality or region filter.",
          minLength: 1,
          maxLength: 120,
        },
      },
      required: ["service", "facilityId", "location"],
    },
    strict: true,
  },
  {
    type: "function",
    name: "check_inventory",
    description:
      "Check a named supply item in the fixed Tulu synthetic demonstration dataset. This is an operational stock lookup, not medical advice. Never describe the result as real medicine availability.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        item: {
          type: "string",
          description:
            "The supply item to find, such as oral rehydration salts or malaria rapid test kit.",
          minLength: 1,
          maxLength: 120,
        },
        facilityId: {
          type: ["string", "null"],
          description: "Optional exact facility identifier from find_facilities.",
          minLength: 1,
          maxLength: 80,
        },
        location: {
          type: ["string", "null"],
          description: "Optional locality or region filter.",
          minLength: 1,
          maxLength: 120,
        },
      },
      required: ["item", "facilityId", "location"],
    },
    strict: true,
  },
] as const satisfies readonly FunctionTool[];

export type OperationalToolName =
  (typeof operationalToolDefinitions)[number]["name"];

export interface OperationalToolExecutionResult {
  ok: boolean;
  output: string;
}

export interface OperationalToolExecutorOptions {
  now?: () => Date;
}

interface ValidityAssessment {
  recordId: string;
  effectiveStatus: VerificationStatus;
  verifiedAt: string | null;
  validUntil: string | null;
}

const MAX_ARGUMENTS_LENGTH = 4_096;

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectValidityAssessments(
  value: unknown,
  evaluatedAt: string,
): ValidityAssessment[] {
  const assessments = new Map<string, ValidityAssessment>();
  const visited = new WeakSet<object>();

  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child);
      return;
    }
    if (!isRecord(candidate) || visited.has(candidate)) return;
    visited.add(candidate);

    if (
      typeof candidate.id === "string" &&
      (candidate.verificationStatus === "verified" ||
        candidate.verificationStatus === "stale" ||
        candidate.verificationStatus === "unknown") &&
      (typeof candidate.verifiedAt === "string" ||
        candidate.verifiedAt === null) &&
      (typeof candidate.validUntil === "string" ||
        candidate.validUntil === null)
    ) {
      const fields = {
        verificationStatus: candidate.verificationStatus as VerificationStatus,
        verifiedAt: candidate.verifiedAt,
        validUntil: candidate.validUntil,
      };
      assessments.set(candidate.id, {
        recordId: candidate.id,
        effectiveStatus: effectiveVerificationStatus(fields, evaluatedAt),
        verifiedAt: fields.verifiedAt,
        validUntil: fields.validUntil,
      });
    }

    for (const child of Object.values(candidate)) visit(child);
  };

  visit(value);
  return [...assessments.values()].toSorted((left, right) =>
    left.recordId.localeCompare(right.recordId),
  );
}

/**
 * Execute only the explicitly registered, read-only operations tools. Every
 * outcome is returned as JSON so the sideband can always satisfy the pending
 * tool call without exposing stack traces or repository internals.
 */
export function createOperationalToolExecutor(
  repository: SyntheticOperationalRepository,
  options: OperationalToolExecutorOptions = {},
) {
  const now = options.now ?? (() => new Date());

  return {
    async execute(
      name: string,
      serializedArguments: string,
    ): Promise<OperationalToolExecutionResult> {
      if (serializedArguments.length > MAX_ARGUMENTS_LENGTH) {
        return {
          ok: false,
          output: serialize({
            ok: false,
            error: {
              code: "invalid_arguments",
              message: "Tool arguments are too large.",
            },
          }),
        };
      }

      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(serializedArguments);
      } catch {
        return {
          ok: false,
          output: serialize({
            ok: false,
            error: {
              code: "invalid_arguments",
              message: "Tool arguments must be valid JSON.",
            },
          }),
        };
      }

      try {
        let data: unknown;
        switch (name) {
          case "find_facilities":
            data = repository.find_facilities(argumentsValue);
            break;
          case "check_service_availability":
            data = repository.check_service_availability(argumentsValue);
            break;
          case "check_inventory":
            data = repository.check_inventory(argumentsValue);
            break;
          default:
            return {
              ok: false,
              output: serialize({
                ok: false,
                error: {
                  code: "unsupported_tool",
                  message: "The requested tool is not available.",
                },
              }),
            };
        }

        const evaluatedAt = now().toISOString();
        return {
          ok: true,
          output: serialize({
            ok: true,
            evaluatedAt,
            validity: collectValidityAssessments(data, evaluatedAt),
            data,
          }),
        };
      } catch (error) {
        if (error instanceof InvalidOperationalQueryError) {
          return {
            ok: false,
            output: serialize({
              ok: false,
              error: {
                code: error.code,
                message: "The tool arguments were invalid.",
                issues: error.issues,
              },
            }),
          };
        }

        return {
          ok: false,
          output: serialize({
            ok: false,
            error: {
              code: "tool_failed",
              message: "The lookup could not be completed.",
            },
          }),
        };
      }
    },
  };
}

export type OperationalToolExecutor = ReturnType<
  typeof createOperationalToolExecutor
>;
