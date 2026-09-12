import type {
  Facility,
  InventoryItem,
  OperationalSnapshot,
  ServiceAvailability,
} from "@tulu/shared";
import {
  facilityTypes,
  inventoryStatuses,
  serviceAvailabilityStatuses,
  verificationSources,
  verificationStatuses,
} from "@tulu/shared";

import { MOCK_FACILITY, type FacilityProfile } from "@/lib/mock-data";

const SNAPSHOT_PATH = "/api/v1/operations/snapshot";
const PREFERRED_DEMO_FACILITY_ID = "facility-north-ridge-demo";
const REQUEST_TIMEOUT_MS = 2_500;
const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8787";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function hasValidVerificationFields(
  value: Record<string, unknown>,
): boolean {
  return (
    isMember(verificationStatuses, value.verificationStatus) &&
    isMember(verificationSources, value.verificationSource) &&
    isNullableString(value.verifiedAt) &&
    isNullableString(value.validUntil)
  );
}

function isFacility(value: unknown): value is Facility {
  if (!isRecord(value) || !isRecord(value.location)) return false;

  return (
    value.synthetic === true &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isMember(facilityTypes, value.type) &&
    hasValidVerificationFields(value) &&
    typeof value.location.locality === "string" &&
    typeof value.location.region === "string" &&
    value.location.countryCode === "KE"
  );
}

function isService(value: unknown): value is ServiceAvailability {
  return (
    isRecord(value) &&
    value.synthetic === true &&
    typeof value.id === "string" &&
    typeof value.facilityId === "string" &&
    typeof value.serviceCode === "string" &&
    typeof value.serviceName === "string" &&
    isMember(serviceAvailabilityStatuses, value.status) &&
    isNullableString(value.note) &&
    hasValidVerificationFields(value)
  );
}

function isInventoryItem(value: unknown): value is InventoryItem {
  return (
    isRecord(value) &&
    value.synthetic === true &&
    typeof value.id === "string" &&
    typeof value.facilityId === "string" &&
    typeof value.itemCode === "string" &&
    typeof value.itemName === "string" &&
    isMember(inventoryStatuses, value.status) &&
    (typeof value.quantity === "number" || value.quantity === null) &&
    typeof value.unit === "string" &&
    hasValidVerificationFields(value)
  );
}

function isOperationalSnapshot(value: unknown): value is OperationalSnapshot {
  return (
    isRecord(value) &&
    value.synthetic === true &&
    typeof value.verifiedAt === "string" &&
    value.datasetVersion === "1" &&
    Array.isArray(value.facilities) &&
    value.facilities.every(isFacility) &&
    Array.isArray(value.services) &&
    value.services.every(isService) &&
    Array.isArray(value.inventory) &&
    value.inventory.every(isInventoryItem)
  );
}

function formatTimestamp(value: string | null): string {
  if (value === null || !Number.isFinite(Date.parse(value))) return "Unknown";

  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSource(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function snapshotToFacilityProfile(
  snapshot: OperationalSnapshot,
): FacilityProfile | null {
  const facility =
    snapshot.facilities.find(
      (candidate) => candidate.id === PREFERRED_DEMO_FACILITY_ID,
    ) ?? snapshot.facilities[0];

  if (!facility) return null;

  const services = snapshot.services
    .filter((service) => service.facilityId === facility.id)
    .map((service) => `${service.serviceName} · ${service.status.replaceAll("_", " ")}`)
    .join("; ");

  return {
    id: facility.id,
    name: facility.name,
    location: `${facility.location.locality}, ${facility.location.region}`,
    openingHours: "Not included in the synthetic operations dataset",
    services: services || "No services listed in the synthetic operations dataset",
    verificationOwner: formatSource(facility.verificationSource),
    lastReviewedAt: formatTimestamp(facility.verifiedAt),
    dataSource: "agent_api",
    synthetic: true,
  };
}

function snapshotUrl(rawBaseUrl: string): URL | null {
  try {
    const baseUrl = new URL(rawBaseUrl);
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
      return null;
    }
    return new URL(SNAPSHOT_PATH, `${baseUrl.origin}/`);
  } catch {
    return null;
  }
}

/**
 * Bootstrap the dashboard with the same synthetic facts available to the voice
 * tools. Fail closed to an explicitly labelled local fixture so the dashboard
 * remains demoable when the Agent API is not configured or temporarily offline.
 */
export async function loadFacilityProfile(): Promise<FacilityProfile> {
  const rawBaseUrl =
    process.env.AGENT_API_URL?.trim() || DEFAULT_AGENT_API_URL;

  const url = snapshotUrl(rawBaseUrl);
  if (!url) return MOCK_FACILITY;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (
      !response.ok ||
      response.headers.get("x-tulu-data-mode") !== "synthetic" ||
      response.headers.get("x-tulu-dataset-version") !== "1" ||
      !response.headers.get("content-type")?.startsWith("application/json")
    ) {
      return MOCK_FACILITY;
    }

    const payload: unknown = await response.json();
    if (!isOperationalSnapshot(payload)) return MOCK_FACILITY;

    return snapshotToFacilityProfile(payload) ?? MOCK_FACILITY;
  } catch {
    return MOCK_FACILITY;
  }
}
