import type {
  Facility,
  InventoryItem,
  ServiceAvailability,
} from "@tulu/shared";

/**
 * This timestamp belongs to a fixed demo fixture. It must not be advanced at
 * query time because doing so would make old synthetic data appear freshly
 * verified.
 */
export const SYNTHETIC_OPERATIONAL_SNAPSHOT_VERIFIED_AT =
  "2026-09-10T09:00:00.000Z";

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export const syntheticFacilities: readonly Facility[] = deepFreeze([
  {
    id: "facility-acacia-plain-demo",
    name: "Tulu Acacia Plain Demo Clinic",
    type: "clinic",
    location: {
      locality: "Acacia Plain Demo Settlement",
      region: "Samburu-inspired Demo Region",
      countryCode: "KE",
    },
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:40:00.000Z",
    validUntil: "2026-09-17T08:40:00.000Z",
    synthetic: true,
  },
  {
    id: "facility-north-ridge-demo",
    name: "Tulu North Ridge Demo Health Centre",
    type: "health_centre",
    location: {
      locality: "North Ridge Demo Settlement",
      region: "Samburu-inspired Demo Region",
      countryCode: "KE",
    },
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:30:00.000Z",
    validUntil: "2026-09-17T08:30:00.000Z",
    synthetic: true,
  },
  {
    id: "facility-river-bend-demo",
    name: "Tulu River Bend Demo Dispensary",
    type: "dispensary",
    location: {
      locality: "River Bend Demo Settlement",
      region: "Samburu-inspired Demo Region",
      countryCode: "KE",
    },
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:20:00.000Z",
    validUntil: "2026-09-17T08:20:00.000Z",
    synthetic: true,
  },
] satisfies Facility[]);

export const syntheticServiceAvailability: readonly ServiceAvailability[] =
  deepFreeze([
    {
      id: "service-acacia-general-consultation",
      facilityId: "facility-acacia-plain-demo",
      serviceCode: "general-consultation",
      serviceName: "General consultation",
      status: "available",
      note: "Synthetic walk-in availability for the demo.",
      verificationStatus: "verified",
      verificationSource: "synthetic_demo_seed",
      verifiedAt: "2026-09-10T08:40:00.000Z",
      validUntil: "2026-09-17T08:40:00.000Z",
      synthetic: true,
    },
    {
      id: "service-acacia-laboratory-testing",
      facilityId: "facility-acacia-plain-demo",
      serviceCode: "basic-laboratory-testing",
      serviceName: "Basic laboratory testing",
      status: "limited",
      note: "Synthetic limited-capacity status for the demo.",
      verificationStatus: "verified",
      verificationSource: "synthetic_demo_seed",
      verifiedAt: "2026-09-10T08:40:00.000Z",
      validUntil: "2026-09-17T08:40:00.000Z",
      synthetic: true,
    },
    {
      id: "service-north-child-health",
      facilityId: "facility-north-ridge-demo",
      serviceCode: "child-health",
      serviceName: "Child health services",
      status: "limited",
      note: "Synthetic limited-capacity status for the demo.",
      verificationStatus: "verified",
      verificationSource: "synthetic_demo_seed",
      verifiedAt: "2026-09-10T08:30:00.000Z",
      validUntil: "2026-09-17T08:30:00.000Z",
      synthetic: true,
    },
    {
      id: "service-north-general-consultation",
      facilityId: "facility-north-ridge-demo",
      serviceCode: "general-consultation",
      serviceName: "General consultation",
      status: "available",
      note: "Synthetic walk-in availability for the demo.",
      verificationStatus: "verified",
      verificationSource: "synthetic_demo_seed",
      verifiedAt: "2026-09-10T08:30:00.000Z",
      validUntil: "2026-09-17T08:30:00.000Z",
      synthetic: true,
    },
    {
      id: "service-north-maternal-health",
      facilityId: "facility-north-ridge-demo",
      serviceCode: "maternal-health",
      serviceName: "Maternal health support",
      status: "available",
      note: "Synthetic daytime availability for the demo.",
      verificationStatus: "verified",
      verificationSource: "synthetic_demo_seed",
      verifiedAt: "2026-09-10T08:30:00.000Z",
      validUntil: "2026-09-17T08:30:00.000Z",
      synthetic: true,
    },
    {
      id: "service-river-general-consultation",
      facilityId: "facility-river-bend-demo",
      serviceCode: "general-consultation",
      serviceName: "General consultation",
      status: "unavailable",
      note: "Synthetic unavailable status for the demo.",
      verificationStatus: "stale",
      verificationSource: "synthetic_demo_seed",
      verifiedAt: "2026-09-01T08:20:00.000Z",
      validUntil: "2026-09-02T08:20:00.000Z",
      synthetic: true,
    },
  ] satisfies ServiceAvailability[]);

export const syntheticInventory: readonly InventoryItem[] = deepFreeze([
  {
    id: "inventory-acacia-malaria-test-kit",
    facilityId: "facility-acacia-plain-demo",
    itemCode: "malaria-rapid-test-kit",
    itemName: "Malaria rapid test kit",
    status: "in_stock",
    quantity: 24,
    unit: "kits",
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:40:00.000Z",
    validUntil: "2026-09-17T08:40:00.000Z",
    synthetic: true,
  },
  {
    id: "inventory-acacia-ors",
    facilityId: "facility-acacia-plain-demo",
    itemCode: "oral-rehydration-salts",
    itemName: "Oral rehydration salts",
    status: "low_stock",
    quantity: 7,
    unit: "sachets",
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:40:00.000Z",
    validUntil: "2026-09-17T08:40:00.000Z",
    synthetic: true,
  },
  {
    id: "inventory-north-dressing-pack",
    facilityId: "facility-north-ridge-demo",
    itemCode: "basic-wound-dressing-pack",
    itemName: "Basic wound dressing pack",
    status: "in_stock",
    quantity: 18,
    unit: "packs",
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:30:00.000Z",
    validUntil: "2026-09-17T08:30:00.000Z",
    synthetic: true,
  },
  {
    id: "inventory-north-ors",
    facilityId: "facility-north-ridge-demo",
    itemCode: "oral-rehydration-salts",
    itemName: "Oral rehydration salts",
    status: "in_stock",
    quantity: 32,
    unit: "sachets",
    verificationStatus: "verified",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-10T08:30:00.000Z",
    validUntil: "2026-09-17T08:30:00.000Z",
    synthetic: true,
  },
  {
    id: "inventory-river-dressing-pack",
    facilityId: "facility-river-bend-demo",
    itemCode: "basic-wound-dressing-pack",
    itemName: "Basic wound dressing pack",
    status: "unknown",
    quantity: null,
    unit: "packs",
    verificationStatus: "stale",
    verificationSource: "synthetic_demo_seed",
    verifiedAt: "2026-09-01T08:20:00.000Z",
    validUntil: "2026-09-02T08:20:00.000Z",
    synthetic: true,
  },
] satisfies InventoryItem[]);
