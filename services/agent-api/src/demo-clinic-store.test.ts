import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DemoClinicStore } from "./tools/demo-clinic-store.js";

const context = {
  sessionId: "session-1",
  clinicId: "maralal-chc",
  clinicTimezone: "Africa/Nairobi",
  clinicLocalDate: "2026-09-12",
  taskRevision: 1,
  operationId: "operation-1",
};

describe("DemoClinicStore", () => {
  it("uses dashboard facility data for availability", async () => {
    const store = new DemoClinicStore();
    store.applyCommand({
      type: "update_facility",
      updates: { services: "Maternity, dental" },
    });

    const available = await store.getServiceAvailability(context, {
      service: "dental",
      date: "2026-09-15",
    });
    const unknown = await store.getServiceAvailability(context, {
      service: "laboratory",
      date: "2026-09-15",
    });

    assert.equal(available.status, "available");
    assert.equal(unknown.status, "unknown");
  });

  it("places one idempotent callback request in the dashboard queue", async () => {
    const store = new DemoClinicStore();
    const first = await store.requestStaffCallback(context, {
      service: "dental",
    });
    const repeated = await store.requestStaffCallback(context, {
      service: "dental",
    });

    assert.deepEqual(repeated, first);
    assert.equal(store.getState().requests.length, 1);
    assert.equal(store.getState().requests[0]?.id, first.callback_request_id);
  });
});