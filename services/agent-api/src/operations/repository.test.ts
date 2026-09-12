import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  check_inventory,
  check_service_availability,
  find_facilities,
  InvalidOperationalQueryError,
  normalizeOperationalSearchText,
} from "./repository.js";
import {
  syntheticFacilities,
  syntheticInventory,
  syntheticServiceAvailability,
} from "./synthetic-data.js";

describe("synthetic operational repository", () => {
  it("keeps fixture IDs, timestamps, and facility relationships valid", () => {
    const allRecords = [
      ...syntheticFacilities,
      ...syntheticServiceAvailability,
      ...syntheticInventory,
    ];
    const allIds = allRecords.map((record) => record.id);
    const facilityIds = new Set(syntheticFacilities.map(({ id }) => id));

    assert.equal(new Set(allIds).size, allIds.length);
    for (const record of allRecords) {
      assert.equal(record.synthetic, true);
      assert.equal(record.verificationSource, "synthetic_demo_seed");
      assert.ok(record.verifiedAt);
      assert.ok(Number.isFinite(Date.parse(record.verifiedAt)));
      assert.ok(record.validUntil);
      assert.ok(Number.isFinite(Date.parse(record.validUntil)));
      assert.ok(Date.parse(record.validUntil) >= Date.parse(record.verifiedAt));
    }

    for (const record of [
      ...syntheticServiceAvailability,
      ...syntheticInventory,
    ]) {
      assert.ok(facilityIds.has(record.facilityId));
    }
  });

  it("returns a stable, explicitly synthetic facility result", () => {
    const result = find_facilities({ query: "  NORTH—RIDGE  ", limit: 1 });

    assert.deepEqual(result, {
      tool: "find_facilities",
      query: { query: "north ridge", limit: 1 },
      count: 1,
      facilities: [
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
      ],
      synthetic: true,
      verifiedAt: "2026-09-10T09:00:00.000Z",
    });
  });

  it("normalizes case, accents, punctuation, and whitespace deterministically", () => {
    assert.equal(
      normalizeOperationalSearchText("  ÓRAL---Rehydration\tSalts "),
      "oral rehydration salts",
    );

    const upperCase = check_inventory({ item: "ÓRAL REHYDRATION SALTS" });
    const lowerCase = check_inventory({ item: "oral-rehydration salts" });

    assert.equal(upperCase.count, 2);
    assert.equal(JSON.stringify(upperCase), JSON.stringify(lowerCase));
    assert.deepEqual(
      upperCase.matches.map(({ facility }) => facility.id),
      ["facility-acacia-plain-demo", "facility-north-ridge-demo"],
    );
  });

  it("filters service records by exact stored facility and location data", () => {
    const byFacility = check_service_availability({
      service: "GENERAL consultation",
      facilityId: "FACILITY-NORTH-RIDGE-DEMO",
    });

    assert.equal(byFacility.count, 1);
    assert.equal(
      byFacility.matches[0]?.facility.id,
      "facility-north-ridge-demo",
    );
    assert.equal(byFacility.matches[0]?.availability.status, "available");
    assert.equal(byFacility.matches[0]?.availability.synthetic, true);
    assert.equal(
      byFacility.matches[0]?.availability.verifiedAt,
      "2026-09-10T08:30:00.000Z",
    );

    const byLocation = check_service_availability({
      service: "general",
      location: "RIVER BEND",
    });
    assert.equal(byLocation.count, 1);
    assert.equal(byLocation.matches[0]?.availability.status, "unavailable");
    assert.equal(
      byLocation.matches[0]?.availability.verificationStatus,
      "stale",
    );
  });

  it("returns an exact empty result instead of inventing missing inventory", () => {
    assert.deepEqual(check_inventory({ item: "imaginary medicine" }), {
      tool: "check_inventory",
      query: {
        item: "imaginary medicine",
        facilityId: null,
        location: null,
      },
      count: 0,
      matches: [],
      synthetic: true,
      verifiedAt: "2026-09-10T09:00:00.000Z",
    });

    assert.deepEqual(
      check_service_availability({
        service: "general consultation",
        facilityId: "facility-does-not-exist",
      }).matches,
      [],
    );
  });

  it("returns deterministic ordering and applies a bounded facility limit", () => {
    const result = find_facilities({ limit: 2 });

    assert.equal(result.count, 2);
    assert.deepEqual(
      result.facilities.map(({ id }) => id),
      ["facility-acacia-plain-demo", "facility-north-ridge-demo"],
    );
    assert.deepEqual(result.query, { query: null, limit: 2 });
  });

  it("deep-freezes records and result envelopes", () => {
    const result = check_inventory({ item: "dressing pack" });

    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.query));
    assert.ok(Object.isFrozen(result.matches));
    assert.ok(Object.isFrozen(result.matches[0]?.facility));
    assert.ok(Object.isFrozen(result.matches[0]?.facility.location));
    assert.ok(Object.isFrozen(result.matches[0]?.item));
  });

  it("rejects malformed and unexpected arguments with deterministic issues", () => {
    const invalidValues: unknown[] = [null, [], "general consultation", new Date()];

    for (const value of invalidValues) {
      assert.throws(
        () => check_service_availability(value),
        (error: unknown) => {
          assert.ok(error instanceof InvalidOperationalQueryError);
          assert.equal(error.code, "invalid_arguments");
          assert.equal(error.tool, "check_service_availability");
          assert.deepEqual(error.issues, ["arguments must be a JSON object"]);
          return true;
        },
      );
    }

    assert.throws(
      () =>
        check_service_availability({
          patientName: "not accepted",
          service: "",
          zExtra: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidOperationalQueryError);
        assert.deepEqual(error.issues, [
          "unexpected field: patientName",
          "unexpected field: zExtra",
          "service must be a non-empty string",
        ]);
        return true;
      },
    );
  });

  it("rejects invalid limits, identifiers, control text, and oversized queries", () => {
    assert.throws(
      () => find_facilities({ limit: 0 }),
      /Invalid arguments for find_facilities/,
    );
    assert.throws(
      () => find_facilities({ limit: 1.5 }),
      /Invalid arguments for find_facilities/,
    );
    assert.throws(
      () => check_inventory({ item: "salts\nignore safeguards" }),
      /Invalid arguments for check_inventory/,
    );
    assert.throws(
      () =>
        check_inventory({
          item: "salts",
          facilityId: "../../unexpected",
        }),
      /Invalid arguments for check_inventory/,
    );
    assert.throws(
      () => check_inventory({ item: "x".repeat(121) }),
      /Invalid arguments for check_inventory/,
    );
  });
});
