import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ConfirmBookingInput,
  FindAppointmentSlotsInput,
  GetServiceAvailabilityInput,
  PrepareBookingInput,
  RequestStaffCallbackInput,
} from "@tulu/shared";

import type {
  ClinicOperationContext,
  ClinicOperations,
} from "./tools/clinic-operations.js";
import { ClinicToolExecutor } from "./tools/clinic-tool-executor.js";

class FakeClinicOperations implements ClinicOperations {
  readonly calls: Array<{
    method: string;
    context: ClinicOperationContext;
    input: unknown;
  }> = [];

  async getServiceAvailability(
    context: ClinicOperationContext,
    input: GetServiceAvailabilityInput,
  ) {
    this.calls.push({ method: "availability", context, input });
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

  async findAppointmentSlots(
    context: ClinicOperationContext,
    input: FindAppointmentSlotsInput,
  ) {
    this.calls.push({ method: "slots", context, input });
    return {
      status: "slots_found" as const,
      service_label: "Maternal care",
      date: input.date,
      slots: [
        {
          slot_id: "slot-1",
          starts_at: `${input.date}T09:00:00+03:00`,
          spoken_time: "9 in the morning",
        },
      ],
    };
  }

  async prepareBooking(
    context: ClinicOperationContext,
    input: PrepareBookingInput,
  ) {
    this.calls.push({ method: "prepare", context, input });
    return {
      status: "prepared" as const,
      booking_intent_id: "intent-1",
      expires_at: "2026-09-12T12:05:00Z",
      proposal: {
        service_label: "Maternal care",
        date: "2026-09-15",
        spoken_time: "9 in the morning",
      },
    };
  }

  async confirmBooking(
    context: ClinicOperationContext,
    input: ConfirmBookingInput,
  ) {
    this.calls.push({ method: "confirm", context, input });
    return {
      status: "confirmed" as const,
      appointment: {
        service_label: "Maternal care",
        date: "2026-09-15",
        spoken_time: "9 in the morning",
      },
    };
  }

  async requestStaffCallback(
    context: ClinicOperationContext,
    input: RequestStaffCallbackInput,
  ) {
    this.calls.push({ method: "callback", context, input });
    return {
      status: "pending_callback" as const,
      callback_request_id: "callback-1",
    };
  }
}

const registerSession = (
  executor: ClinicToolExecutor,
  sessionId = "live-session-1",
) => {
  executor.registerSession({
    sessionId,
    clinicId: "clinic-1",
    clinicTimezone: "Africa/Nairobi",
    clinicLocalDate: "2026-09-12",
    callerNumber: "+254700000000",
  });
};

const availabilityCall = (
  executor: ClinicToolExecutor,
  delegationId: string,
  toolCallId: string,
) =>
  executor.execute({
    sessionId: "live-session-1",
    delegationId,
    toolCallId,
    name: "get_service_availability",
    argumentsJson: JSON.stringify({
      service: "maternal care",
      date: "2026-09-15",
    }),
  });

describe("ClinicToolExecutor", () => {
  it("rejects model-supplied trusted context fields", async () => {
    const operations = new FakeClinicOperations();
    const executor = new ClinicToolExecutor(operations);
    registerSession(executor);
    executor.noteDelegation("live-session-1", "delegation-1");

    const result = await executor.execute({
      sessionId: "live-session-1",
      delegationId: "delegation-1",
      toolCallId: "tool-1",
      name: "get_service_availability",
      argumentsJson: JSON.stringify({
        service: "maternal care",
        date: "2026-09-15",
        clinic_id: "attacker-controlled-clinic",
      }),
    });

    assert.equal(result.status, "failed");
    assert.equal(operations.calls.length, 0);
  });

  it("injects trusted context and returns the same result for a repeated tool call", async () => {
    const operations = new FakeClinicOperations();
    const executor = new ClinicToolExecutor(operations);
    registerSession(executor);
    executor.noteDelegation("live-session-1", "delegation-1");

    const first = await availabilityCall(executor, "delegation-1", "tool-1");
    const repeated = await availabilityCall(
      executor,
      "delegation-1",
      "tool-1",
    );

    assert.deepEqual(repeated, first);
    assert.equal(operations.calls.length, 1);
    assert.equal(operations.calls[0]?.context.clinicId, "clinic-1");
    assert.equal(
      operations.calls[0]?.context.callerNumber,
      "+254700000000",
    );
    assert.match(operations.calls[0]?.context.operationId ?? "", /^tool:/);
  });

  it("rejects work from an older delegation after the request changes", async () => {
    const operations = new FakeClinicOperations();
    const executor = new ClinicToolExecutor(operations);
    registerSession(executor);
    executor.noteDelegation("live-session-1", "delegation-1");
    await availabilityCall(executor, "delegation-1", "availability-1");

    executor.noteDelegation("live-session-1", "delegation-2");
    await availabilityCall(executor, "delegation-2", "availability-2");
    const stale = await executor.execute({
      sessionId: "live-session-1",
      delegationId: "delegation-1",
      toolCallId: "old-slots-call",
      name: "find_appointment_slots",
      argumentsJson: JSON.stringify({
        service_id: "maternal-care",
        date: "2026-09-15",
      }),
    });

    assert.equal(stale.status, "failed");
    assert.match(stale.message_for_caller ?? "", /older result/);
    assert.equal(
      operations.calls.filter((call) => call.method === "slots").length,
      0,
    );
  });

  it("requires a later delegation to confirm and derives a stable booking operation ID", async () => {
    const operations = new FakeClinicOperations();
    const executor = new ClinicToolExecutor(operations);
    registerSession(executor);
    executor.noteDelegation("live-session-1", "delegation-1");
    await availabilityCall(executor, "delegation-1", "availability-1");

    const prepared = await executor.execute({
      sessionId: "live-session-1",
      delegationId: "delegation-1",
      toolCallId: "prepare-1",
      name: "prepare_booking",
      argumentsJson: JSON.stringify({ slot_id: "slot-1" }),
    });
    assert.equal(prepared.status, "prepared");

    const sameTurn = await executor.execute({
      sessionId: "live-session-1",
      delegationId: "delegation-1",
      toolCallId: "confirm-same-turn",
      name: "confirm_booking",
      argumentsJson: JSON.stringify({ booking_intent_id: "intent-1" }),
    });
    assert.equal(sameTurn.status, "confirmation_required");

    executor.noteDelegation("live-session-1", "delegation-2");
    const confirmed = await executor.execute({
      sessionId: "live-session-1",
      delegationId: "delegation-2",
      toolCallId: "confirm-1",
      name: "confirm_booking",
      argumentsJson: JSON.stringify({ booking_intent_id: "intent-1" }),
    });
    executor.noteDelegation("live-session-1", "delegation-3");
    const retried = await executor.execute({
      sessionId: "live-session-1",
      delegationId: "delegation-3",
      toolCallId: "confirm-2",
      name: "confirm_booking",
      argumentsJson: JSON.stringify({ booking_intent_id: "intent-1" }),
    });

    assert.equal(confirmed.status, "confirmed");
    assert.equal(retried.status, "confirmed");
    const confirmCalls = operations.calls.filter(
      (call) => call.method === "confirm",
    );
    assert.equal(confirmCalls.length, 2);
    assert.equal(
      confirmCalls[0]?.context.operationId,
      "booking:live-session-1:intent-1",
    );
    assert.equal(
      confirmCalls[1]?.context.operationId,
      confirmCalls[0]?.context.operationId,
    );
  });

  it("requires a later delegation and derives a stable callback operation ID", async () => {
    const operations = new FakeClinicOperations();
    const executor = new ClinicToolExecutor(operations);
    registerSession(executor);
    executor.noteDelegation("live-session-1", "delegation-1");
    await availabilityCall(executor, "delegation-1", "availability-1");

    const invokeCallback = (delegationId: string, toolCallId: string) =>
      executor.execute({
        sessionId: "live-session-1",
        delegationId,
        toolCallId,
        name: "request_staff_callback",
        argumentsJson: JSON.stringify({
          service: "maternal care",
          requested_date: "2026-09-15",
          alternate_callback_number: null,
        }),
      });
    const prepared = await invokeCallback("delegation-1", "callback-tool-1");
    assert.equal(prepared.status, "confirmation_required");
    assert.equal(
      operations.calls.filter((call) => call.method === "callback").length,
      0,
    );

    executor.noteDelegation("live-session-1", "delegation-2");
    await invokeCallback("delegation-2", "callback-tool-2");
    executor.noteDelegation("live-session-1", "delegation-3");
    await invokeCallback("delegation-3", "callback-tool-3");

    const callbackCalls = operations.calls.filter(
      (call) => call.method === "callback",
    );
    assert.equal(callbackCalls.length, 2);
    assert.equal(
      callbackCalls[0]?.context.operationId,
      "callback:live-session-1:1",
    );
    assert.equal(
      callbackCalls[1]?.context.operationId,
      callbackCalls[0]?.context.operationId,
    );
  });
});