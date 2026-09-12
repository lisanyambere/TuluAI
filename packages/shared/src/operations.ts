/** An RFC 3339 timestamp serialized as a string at the API boundary. */
export type IsoTimestamp = string;

export const verificationStatuses = ["verified", "stale", "unknown"] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];

export const verificationSources = [
  "synthetic_demo_seed",
  "facility_staff",
  "system_import",
] as const;

export type VerificationSource = (typeof verificationSources)[number];

/**
 * Verification fields shared by operational records.
 *
 * A null timestamp is represented explicitly instead of omitting the field so
 * serialized records retain one stable shape when verification is unknown.
 */
export interface VerificationFields {
  verificationStatus: VerificationStatus;
  verificationSource: VerificationSource;
  verifiedAt: IsoTimestamp | null;
  validUntil: IsoTimestamp | null;
}

/**
 * Resolve a record's usable status at a trusted point in time. A record marked
 * verified is no longer current once its validity window has elapsed.
 */
export function effectiveVerificationStatus(
  fields: Pick<
    VerificationFields,
    "verificationStatus" | "verifiedAt" | "validUntil"
  >,
  evaluatedAt: IsoTimestamp,
): VerificationStatus {
  if (fields.verificationStatus !== "verified") {
    return fields.verificationStatus;
  }
  if (fields.verifiedAt === null || fields.validUntil === null) return "unknown";

  const evaluatedAtMs = Date.parse(evaluatedAt);
  const verifiedAtMs = Date.parse(fields.verifiedAt);
  const validUntilMs = Date.parse(fields.validUntil);
  if (
    !Number.isFinite(evaluatedAtMs) ||
    !Number.isFinite(verifiedAtMs) ||
    !Number.isFinite(validUntilMs) ||
    validUntilMs < verifiedAtMs
  ) {
    return "unknown";
  }

  return validUntilMs <= evaluatedAtMs ? "stale" : "verified";
}

export interface SyntheticOperationalRecord extends VerificationFields {
  synthetic: true;
}

export const facilityTypes = ["health_centre", "clinic", "dispensary"] as const;

export type FacilityType = (typeof facilityTypes)[number];

export interface FacilityLocation {
  locality: string;
  region: string;
  countryCode: "KE";
}

export interface Facility extends SyntheticOperationalRecord {
  id: string;
  name: string;
  type: FacilityType;
  location: FacilityLocation;
}

export const serviceAvailabilityStatuses = [
  "available",
  "limited",
  "unavailable",
  "unknown",
] as const;

export type ServiceAvailabilityStatus =
  (typeof serviceAvailabilityStatuses)[number];

export interface ServiceAvailability extends SyntheticOperationalRecord {
  id: string;
  facilityId: string;
  serviceCode: string;
  serviceName: string;
  status: ServiceAvailabilityStatus;
  note: string | null;
}

export const inventoryStatuses = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unknown",
] as const;

export type InventoryStatus = (typeof inventoryStatuses)[number];

export interface InventoryItem extends SyntheticOperationalRecord {
  id: string;
  facilityId: string;
  itemCode: string;
  itemName: string;
  status: InventoryStatus;
  quantity: number | null;
  unit: string;
}

export interface FindFacilitiesArguments {
  query?: string | null;
  limit?: number | null;
}

export interface CheckServiceAvailabilityArguments {
  service: string;
  facilityId?: string | null;
  location?: string | null;
}

export interface CheckInventoryArguments {
  item: string;
  facilityId?: string | null;
  location?: string | null;
}

export interface OperationalQueryResultBase {
  synthetic: true;
  /** Timestamp of the fixed synthetic repository snapshot used for this result. */
  verifiedAt: IsoTimestamp;
}

export interface OperationalSnapshot extends OperationalQueryResultBase {
  datasetVersion: "1";
  facilities: readonly Facility[];
  services: readonly ServiceAvailability[];
  inventory: readonly InventoryItem[];
}

export interface FindFacilitiesResult extends OperationalQueryResultBase {
  tool: "find_facilities";
  query: {
    query: string | null;
    limit: number;
  };
  count: number;
  facilities: readonly Facility[];
}

export interface ServiceAvailabilityMatch {
  facility: Facility;
  availability: ServiceAvailability;
}

export interface CheckServiceAvailabilityResult
  extends OperationalQueryResultBase {
  tool: "check_service_availability";
  query: {
    service: string;
    facilityId: string | null;
    location: string | null;
  };
  count: number;
  matches: readonly ServiceAvailabilityMatch[];
}

export interface InventoryMatch {
  facility: Facility;
  item: InventoryItem;
}

export interface CheckInventoryResult extends OperationalQueryResultBase {
  tool: "check_inventory";
  query: {
    item: string;
    facilityId: string | null;
    location: string | null;
  };
  count: number;
  matches: readonly InventoryMatch[];
}
