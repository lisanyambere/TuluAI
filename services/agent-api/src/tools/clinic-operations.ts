import type {
  ConfirmBookingInput,
  ConfirmBookingOutput,
  FindAppointmentSlotsInput,
  FindAppointmentSlotsOutput,
  GetServiceAvailabilityInput,
  GetServiceAvailabilityOutput,
  PrepareBookingInput,
  PrepareBookingOutput,
  RequestStaffCallbackInput,
  RequestStaffCallbackOutput,
} from "@tulu/shared";

export interface ClinicOperationContext {
  sessionId: string;
  clinicId: string;
  clinicTimezone: string;
  clinicLocalDate: string;
  taskRevision: number;
  operationId: string;
  callerNumber?: string;
}

export interface ClinicOperations {
  getServiceAvailability(
    context: ClinicOperationContext,
    input: GetServiceAvailabilityInput,
  ): Promise<GetServiceAvailabilityOutput>;

  findAppointmentSlots(
    context: ClinicOperationContext,
    input: FindAppointmentSlotsInput,
  ): Promise<FindAppointmentSlotsOutput>;

  prepareBooking(
    context: ClinicOperationContext,
    input: PrepareBookingInput,
  ): Promise<PrepareBookingOutput>;

  confirmBooking(
    context: ClinicOperationContext,
    input: ConfirmBookingInput,
  ): Promise<ConfirmBookingOutput>;

  requestStaffCallback(
    context: ClinicOperationContext,
    input: RequestStaffCallbackInput,
  ): Promise<RequestStaffCallbackOutput>;
}