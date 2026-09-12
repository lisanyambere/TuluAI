import type {
  CheckInventoryResult,
  CheckServiceAvailabilityResult,
  Facility,
  FindFacilitiesResult,
  InventoryItem,
  InventoryMatch,
  ServiceAvailability,
  ServiceAvailabilityMatch,
} from "@tulu/shared";

import {
  SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT,
  syntheticFacilities,
  syntheticInventory,
  syntheticServiceAvailability,
} from "./synthetic-data.js";

const DEFAULT_FACILITY_LIMIT = 10;
const MAX_FACILITY_LIMIT = 20;
const MAX_QUERY_LENGTH = 120;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}]/u;

type OperationalToolName =
  | "find_facilities"
  | "check_service_availability"
  | "check_inventory";

interface NormalizedFindFacilitiesArguments {
  query: string | null;
  limit: number;
}

interface NormalizedServiceArguments {
  service: string;
  facilityId: string | null;
  location: string | null;
}

interface NormalizedInventoryArguments {
  item: string;
  facilityId: string | null;
  location: string | null;
}

export class InvalidOperationalQueryError extends TypeError {
  readonly code = "invalid_arguments";
  readonly tool: OperationalToolName;
  readonly issues: readonly string[];

  constructor(tool: OperationalToolName, issues: readonly string[]) {
    super(`Invalid arguments for ${tool}`);
    this.name = "InvalidOperationalQueryError";
    this.tool = tool;
    this.issues = Object.freeze([...issues]);
  }
}

export interface SyntheticOperationalRepository {
  find_facilities(argumentsValue: unknown): FindFacilitiesResult;
  check_service_availability(
    argumentsValue: unknown,
  ): CheckServiceAvailabilityResult;
  check_inventory(argumentsValue: unknown): CheckInventoryResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

/**
 * Normalization is deliberately lexical, not semantic. Queries only match
 * text present in the fixed dataset and cannot generate inferred facilities,
 * services, inventory, or aliases.
 */
export function normalizeOperationalSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function unexpectedFieldIssues(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
): string[] {
  const allowed = new Set(allowedFields);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => `unexpected field: ${key}`);
}

function readSearchString(
  value: Record<string, unknown>,
  field: string,
  options: { required: boolean },
  issues: string[],
): string | null {
  const raw = value[field];

  if (raw === undefined) {
    if (options.required) issues.push(`${field} is required`);
    return null;
  }

  if (raw === null && !options.required) return null;

  if (typeof raw !== "string") {
    issues.push(`${field} must be a string`);
    return null;
  }

  if (raw.length > MAX_QUERY_LENGTH) {
    issues.push(`${field} must not exceed ${MAX_QUERY_LENGTH} characters`);
    return null;
  }

  if (UNSAFE_TEXT.test(raw)) {
    issues.push(`${field} must not contain control or formatting characters`);
    return null;
  }

  const normalized = normalizeOperationalSearchText(raw);
  if (normalized.length === 0) {
    issues.push(`${field} must be a non-empty string`);
    return null;
  }

  return normalized;
}

function readFacilityId(
  value: Record<string, unknown>,
  issues: string[],
): string | null {
  const raw = value.facilityId;
  if (raw === undefined || raw === null) return null;

  if (typeof raw !== "string") {
    issues.push("facilityId must be a string");
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (!SAFE_IDENTIFIER.test(normalized)) {
    issues.push(
      "facilityId must be a non-empty identifier containing only letters, numbers, hyphens, or underscores",
    );
    return null;
  }

  return normalized;
}

function requireArgumentsObject(
  tool: OperationalToolName,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidOperationalQueryError(tool, [
      "arguments must be a JSON object",
    ]);
  }
  return value;
}

function parseFindFacilitiesArguments(
  value: unknown,
): NormalizedFindFacilitiesArguments {
  const tool = "find_facilities";
  const record = requireArgumentsObject(tool, value);
  const issues = unexpectedFieldIssues(record, ["query", "limit"]);
  const query = readSearchString(record, "query", { required: false }, issues);
  const rawLimit = record.limit;
  let limit = DEFAULT_FACILITY_LIMIT;

  if (rawLimit !== undefined && rawLimit !== null) {
    if (
      typeof rawLimit !== "number" ||
      !Number.isInteger(rawLimit) ||
      rawLimit < 1 ||
      rawLimit > MAX_FACILITY_LIMIT
    ) {
      issues.push(`limit must be an integer between 1 and ${MAX_FACILITY_LIMIT}`);
    } else {
      limit = rawLimit;
    }
  }

  if (issues.length > 0) throw new InvalidOperationalQueryError(tool, issues);
  return { query, limit };
}

function parseServiceArguments(value: unknown): NormalizedServiceArguments {
  const tool = "check_service_availability";
  const record = requireArgumentsObject(tool, value);
  const issues = unexpectedFieldIssues(record, [
    "service",
    "facilityId",
    "location",
  ]);
  const service = readSearchString(
    record,
    "service",
    { required: true },
    issues,
  );
  const facilityId = readFacilityId(record, issues);
  const location = readSearchString(
    record,
    "location",
    { required: false },
    issues,
  );

  if (issues.length > 0 || service === null) {
    throw new InvalidOperationalQueryError(tool, issues);
  }
  return { service, facilityId, location };
}

function parseInventoryArguments(value: unknown): NormalizedInventoryArguments {
  const tool = "check_inventory";
  const record = requireArgumentsObject(tool, value);
  const issues = unexpectedFieldIssues(record, [
    "item",
    "facilityId",
    "location",
  ]);
  const item = readSearchString(record, "item", { required: true }, issues);
  const facilityId = readFacilityId(record, issues);
  const location = readSearchString(
    record,
    "location",
    { required: false },
    issues,
  );

  if (issues.length > 0 || item === null) {
    throw new InvalidOperationalQueryError(tool, issues);
  }
  return { item, facilityId, location };
}

function compareIds(left: { id: string }, right: { id: string }): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function facilitySearchText(facility: Facility): string {
  return normalizeOperationalSearchText(
    `${facility.id} ${facility.name} ${facility.type} ${facility.location.locality} ${facility.location.region} ${facility.location.countryCode}`,
  );
}

function facilityMatchesFilters(
  facility: Facility,
  facilityId: string | null,
  location: string | null,
): boolean {
  if (facilityId !== null && facility.id.toLowerCase() !== facilityId) {
    return false;
  }

  if (location !== null) {
    const locationText = normalizeOperationalSearchText(
      `${facility.location.locality} ${facility.location.region}`,
    );
    if (!locationText.includes(location)) return false;
  }

  return true;
}

function createRepository(): SyntheticOperationalRepository {
  const facilitiesById = new Map(
    syntheticFacilities.map((facility) => [facility.id, facility]),
  );

  return Object.freeze({
    find_facilities(argumentsValue: unknown): FindFacilitiesResult {
      const query = parseFindFacilitiesArguments(argumentsValue);
      const facilities = syntheticFacilities
        .filter(
          (facility) =>
            query.query === null ||
            facilitySearchText(facility).includes(query.query),
        )
        .toSorted(compareIds)
        .slice(0, query.limit);

      return deepFreeze({
        tool: "find_facilities",
        query,
        count: facilities.length,
        facilities,
        synthetic: true,
        verifiedAt: SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT,
      }) as FindFacilitiesResult;
    },

    check_service_availability(
      argumentsValue: unknown,
    ): CheckServiceAvailabilityResult {
      const query = parseServiceArguments(argumentsValue);
      const matches: ServiceAvailabilityMatch[] = [];

      for (const availability of syntheticServiceAvailability) {
        const serviceText = normalizeOperationalSearchText(
          `${availability.serviceCode} ${availability.serviceName}`,
        );
        if (!serviceText.includes(query.service)) continue;

        const facility = facilitiesById.get(availability.facilityId);
        if (
          facility === undefined ||
          !facilityMatchesFilters(facility, query.facilityId, query.location)
        ) {
          continue;
        }

        matches.push({ facility, availability });
      }

      matches.sort((left, right) => {
        const facilityOrder = compareIds(left.facility, right.facility);
        return facilityOrder === 0
          ? compareIds(left.availability, right.availability)
          : facilityOrder;
      });

      return deepFreeze({
        tool: "check_service_availability",
        query,
        count: matches.length,
        matches,
        synthetic: true,
        verifiedAt: SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT,
      }) as CheckServiceAvailabilityResult;
    },

    check_inventory(argumentsValue: unknown): CheckInventoryResult {
      const query = parseInventoryArguments(argumentsValue);
      const matches: InventoryMatch[] = [];

      for (const item of syntheticInventory) {
        const itemText = normalizeOperationalSearchText(
          `${item.itemCode} ${item.itemName}`,
        );
        if (!itemText.includes(query.item)) continue;

        const facility = facilitiesById.get(item.facilityId);
        if (
          facility === undefined ||
          !facilityMatchesFilters(facility, query.facilityId, query.location)
        ) {
          continue;
        }

        matches.push({ facility, item });
      }

      matches.sort((left, right) => {
        const facilityOrder = compareIds(left.facility, right.facility);
        return facilityOrder === 0
          ? compareIds(left.item, right.item)
          : facilityOrder;
      });

      return deepFreeze({
        tool: "check_inventory",
        query,
        count: matches.length,
        matches,
        synthetic: true,
        verifiedAt: SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT,
      }) as CheckInventoryResult;
    },
  });
}

export function createSyntheticOperationalRepository(): SyntheticOperationalRepository {
  return createRepository();
}

export const syntheticOperationalRepository =
  createSyntheticOperationalRepository();

export function find_facilities(argumentsValue: unknown): FindFacilitiesResult {
  return syntheticOperationalRepository.find_facilities(argumentsValue);
}

export function check_service_availability(
  argumentsValue: unknown,
): CheckServiceAvailabilityResult {
  return syntheticOperationalRepository.check_service_availability(argumentsValue);
}

export function check_inventory(argumentsValue: unknown): CheckInventoryResult {
  return syntheticOperationalRepository.check_inventory(argumentsValue);
}
