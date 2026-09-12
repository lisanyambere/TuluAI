import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ConfirmBookingInput,
  FindAppointmentSlotsInput,
  GetServiceAvailabilityInput,
  PrepareBookingInput,
  RequestStaffCallbackInput,
} from "@tulu/shared";
import type { ConnectClientEvent } from "openai/resources/live/sideband/sideband";

import {
  runClinicToolSideband,
  type LiveSidebandConnection,
} from "./live/clinic-live-tool-runtime.js";
import type {
  ClinicOperationContext,
  ClinicOperations,
} from "./tools/clinic-operations.js";
import { ClinicToolExecutor } from "./tools/clinic-tool-executor.js";

class AvailabilityOnlyOperations implements ClinicOperations {
  calls = 0;

  async getServiceAvailability(
    context: ClinicOperationContext,
    input: GetServiceAvailabilityInput,
  ) {
    this.calls += 1;
    return {
      status: "available" as const,
      service_id: "maternal-care",
      service_label: "Maternal care",
      date: input.date,
      clinic_timezone: context.clinicTimezone,
      source_label: "Clinic coordinator",
      updated_at: "2026-09-12T09:00:00+03:00",
    };
  }

  findAppointmentSlots(
    _context: ClinicOperationContext,
    _input: FindAppointmentSlotsInput,
  ): never {
    throw new Error("Unexpected call");
  }

  prepareBooking(
    _context: ClinicOperationContext,
    _input: PrepareBookingInput,
  ): never {
    throw new Error("Unexpected call");
  }

  confirmBooking(
    _context: ClinicOperationContext,
    _input: ConfirmBookingInput,
  ): never {
    throw new Error("Unexpected call");
  }

  requestStaffCallback(
    _context: ClinicOperationContext,
    _input: RequestStaffCallbackInput,
  ): never {
    throw new Error("Unexpected call");
  }
}

describe("clinic Live tool sideband", () => {
  it("executes a nested function call and continues the delegated response", async () => {
    const operations = new AvailabilityOnlyOperations();
    const executor = new ClinicToolExecutor(operations);
    executor.registerSession({
      sessionId: "session-1",
      clinicId: "clinic-1",
      clinicTimezone: "Africa/Nairobi",
      clinicLocalDate: "2026-09-12",
    });
    const sent: ConnectClientEvent[] = [];
    let closed = false;
    const frames = [
      {
        type: "message" as const,
        message: {
          type: "session.delegation.created",
          delegation: { id: "delegation-1" },
        },
      },
      {
        type: "message" as const,
        message: {
          type: "response.event",
          delegation_id: "delegation-1",
          event: {
            type: "response.output_item.done",
            item: {
              type: "function_call",
              call_id: "call-1",
              name: "get_service_availability",
              arguments: JSON.stringify({
                service: "maternal care",
                date: "2026-09-15",
              }),
            },
          },
        },
      },
      {
        type: "message" as const,
        message: { type: "session.closed" },
      },
    ];
    const connection = {
      send: (event: ConnectClientEvent) => sent.push(event),
      stream: async function* () {
        for (const frame of frames) yield frame;
      },
      close: () => {
        closed = true;
      },
    } as LiveSidebandConnection;

    await runClinicToolSideband("session-1", connection, executor);

    assert.equal(operations.calls, 1);
    assert.equal(sent[0]?.type, "response.item.create");
    assert.equal(sent[1]?.type, "response.create");
    if (sent[0]?.type !== "response.item.create") {
      assert.fail("Expected function output event");
    }
    assert.equal(sent[0].item.type, "function_call_output");
    assert.equal(sent[0].item.call_id, "call-1");
    assert.match(sent[0].item.output, /"status":"available"/);
    assert.equal(closed, true);

    const afterClose = await executor.execute({
      sessionId: "session-1",
      delegationId: "delegation-1",
      toolCallId: "call-after-close",
      name: "get_service_availability",
      argumentsJson: "{}",
    });
    assert.equal(afterClose.status, "failed");
    assert.match(afterClose.message_for_caller ?? "", /no longer available/);
  });
});