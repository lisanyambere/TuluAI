import {
  REQUEST_STATUSES,
  type ConfirmBookingInput,
  type ConfirmBookingOutput,
  type DashboardCommand,
  type DashboardState,
  type FindAppointmentSlotsInput,
  type FindAppointmentSlotsOutput,
  type GetServiceAvailabilityInput,
  type GetServiceAvailabilityOutput,
  type PrepareBookingInput,
  type PrepareBookingOutput,
  type RequestStaffCallbackInput,
  type RequestStaffCallbackOutput,
  type TuluRequest,
} from "@tulu/shared";

import type {
  ClinicOperationContext,
  ClinicOperations,
} from "./clinic-operations.js";

type BookingIntent = {
  serviceLabel: string;
  date: string;
  spokenTime: string;
};

const nowLabel = () => new Date().toISOString();
const serviceId = (service: string) =>
  service.toLowerCase().replace(/maternal/g, "maternity").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export class DemoClinicStore implements ClinicOperations {
  readonly #state: DashboardState = {
    facility: {
      id: "maralal-chc",
      name: "Maralal Community Health Centre",
      location: "Maralal, Samburu County",
      openingHours: "Open today · 08:00–17:00",
      services: "Maternity, outpatient, laboratory",
      verificationOwner: "Grace N. · Facility supervisor",
      lastReviewedAt: nowLabel(),
    },
    requests: [],
  };
  readonly #bookingIntents = new Map<string, BookingIntent>();
  readonly #writeResults = new Map<string, ConfirmBookingOutput | RequestStaffCallbackOutput>();
  #nextRequestNumber = 1043;

  getState(): DashboardState {
    return structuredClone(this.#state);
  }

  applyCommand(command: DashboardCommand): DashboardState {
    if (command.type === "update_facility") {
      this.#state.facility = {
        ...this.#state.facility,
        ...command.updates,
        id: this.#state.facility.id,
        lastReviewedAt: nowLabel(),
      };
      return this.getState();
    }

    const request = this.#state.requests.find((item) => item.id === command.id);
    if (!request) return this.getState();
    const event = (action: string) => ({
      id: `${request.id}-${Date.now()}`,
      actor: "Grace N. (demo)",
      action,
      createdAt: nowLabel(),
    });

    if (command.type === "set_status" && REQUEST_STATUSES.includes(command.status)) {
      request.status = command.status;
      request.auditEvents.push(event(command.action));
    } else if (command.type === "confirm_request") {
      request.status = "confirmed";
      request.verification = {
        state: "verified",
        lastVerifiedAt: nowLabel(),
        verifiedBy: "Grace N. (demo)",
      };
      request.auditEvents.push(event("Information confirmed"));
    } else if (command.type === "reject_request") {
      request.status = "rejected";
      request.verification = {
        state: "verified",
        lastVerifiedAt: nowLabel(),
        verifiedBy: "Grace N. (demo)",
      };
      request.auditEvents.push(event("Availability marked unavailable"));
    } else if (command.type === "assign_request") {
      request.assignedTo = command.assignee;
      request.auditEvents.push(event(command.assignee ? `Assigned to ${command.assignee}` : "Assignment removed"));
    } else if (command.type === "add_note" && command.body.trim()) {
      request.notes.push({
        id: `${request.id}-note-${Date.now()}`,
        author: "Grace N. (demo)",
        body: command.body.trim(),
        createdAt: nowLabel(),
      });
      request.auditEvents.push(event("Internal note added"));
    }
    return this.getState();
  }

  async getServiceAvailability(
    context: ClinicOperationContext,
    input: GetServiceAvailabilityInput,
  ): Promise<GetServiceAvailabilityOutput> {
    const requestedId = serviceId(input.service);
    const service = this.#services().find((candidate) => {
      const candidateId = serviceId(candidate);
      return candidateId.includes(requestedId) || requestedId.includes(candidateId);
    });
    if (!service) {
      return {
        status: "unknown",
        service_label: input.service,
        date: input.date,
        clinic_timezone: context.clinicTimezone,
        source_label: "Tulu facility dashboard",
        updated_at: this.#state.facility.lastReviewedAt,
        message_for_caller: "That service is not listed in the current facility profile.",
      };
    }
    return {
      status: "available",
      service_id: serviceId(service),
      service_label: service,
      date: input.date,
      clinic_timezone: context.clinicTimezone,
      source_label: "Tulu facility dashboard",
      updated_at: this.#state.facility.lastReviewedAt,
    };
  }

  async findAppointmentSlots(
    _context: ClinicOperationContext,
    input: FindAppointmentSlotsInput,
  ): Promise<FindAppointmentSlotsOutput> {
    const service = this.#services().find((candidate) => serviceId(candidate) === input.service_id);
    if (!service) {
      return { status: "no_slots", service_label: input.service_id, date: input.date, slots: [] };
    }
    const options = [
      ["09:00", "9 in the morning"],
      ["11:00", "11 in the morning"],
      ["14:00", "2 in the afternoon"],
    ] as const;
    return {
      status: "slots_found",
      service_label: service,
      date: input.date,
      slots: options.map(([time, spokenTime]) => ({
        slot_id: `${serviceId(service)}::${input.date}::${time}`,
        starts_at: `${input.date}T${time}:00+03:00`,
        spoken_time: spokenTime,
      })),
    };
  }

  async prepareBooking(
    _context: ClinicOperationContext,
    input: PrepareBookingInput,
  ): Promise<PrepareBookingOutput> {
    const [requestedServiceId, date, time] = input.slot_id.split("::");
    const service = this.#services().find((candidate) => serviceId(candidate) === requestedServiceId);
    const spokenTimes: Record<string, string> = {
      "09:00": "9 in the morning",
      "11:00": "11 in the morning",
      "14:00": "2 in the afternoon",
    };
    if (!service || !date || !time || !spokenTimes[time]) {
      return { status: "slot_unavailable", message_for_caller: "That appointment slot is no longer available." };
    }
    const bookingIntentId = `intent:${input.slot_id}`;
    const proposal = { serviceLabel: service, date, spokenTime: spokenTimes[time] };
    this.#bookingIntents.set(bookingIntentId, proposal);
    return {
      status: "prepared",
      booking_intent_id: bookingIntentId,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      proposal: {
        service_label: proposal.serviceLabel,
        date: proposal.date,
        spoken_time: proposal.spokenTime,
      },
    };
  }

  async confirmBooking(
    context: ClinicOperationContext,
    input: ConfirmBookingInput,
  ): Promise<ConfirmBookingOutput> {
    const cached = this.#writeResults.get(context.operationId);
    if (cached) return cached as ConfirmBookingOutput;
    const intent = this.#bookingIntents.get(input.booking_intent_id);
    if (!intent) return { status: "slot_unavailable", message_for_caller: "That booking proposal has expired." };
    const result: ConfirmBookingOutput = {
      status: "confirmed",
      appointment: {
        service_label: intent.serviceLabel,
        date: intent.date,
        spoken_time: intent.spokenTime,
      },
    };
    this.#writeResults.set(context.operationId, result);
    this.#addRequest({
      status: "confirmed",
      summary: `${intent.serviceLabel} appointment confirmed for ${intent.spokenTime}`,
      requestedService: intent.serviceLabel,
      verificationState: "verified",
    });
    return result;
  }

  async requestStaffCallback(
    context: ClinicOperationContext,
    input: RequestStaffCallbackInput,
  ): Promise<RequestStaffCallbackOutput> {
    const cached = this.#writeResults.get(context.operationId);
    if (cached) return cached as RequestStaffCallbackOutput;
    const callbackRequestId = this.#addRequest({
      status: "new",
      summary: `Caller requested staff follow-up for ${input.service}`,
      requestedService: input.service,
      verificationState: "unverified",
    });
    const result: RequestStaffCallbackOutput = {
      status: "pending_callback",
      callback_request_id: callbackRequestId,
    };
    this.#writeResults.set(context.operationId, result);
    return result;
  }

  #services(): string[] {
    return this.#state.facility.services.split(",").map((service) => service.trim()).filter(Boolean);
  }

  #addRequest(input: {
    status: TuluRequest["status"];
    summary: string;
    requestedService: string;
    verificationState: TuluRequest["verification"]["state"];
  }): string {
    const id = `TUL-${this.#nextRequestNumber++}`;
    this.#state.requests.unshift({
      id,
      receivedAt: nowLabel(),
      status: input.status,
      priority: "normal",
      language: "en",
      summary: input.summary,
      requestedService: input.requestedService,
      callerReference: "Tulu voice caller",
      facilityId: this.#state.facility.id,
      facilityName: this.#state.facility.name,
      verification: { state: input.verificationState },
      notes: [],
      auditEvents: [{ id: `${id}-created`, actor: "Tulu voice agent", action: "Request received", createdAt: nowLabel() }],
    });
    return id;
  }
}