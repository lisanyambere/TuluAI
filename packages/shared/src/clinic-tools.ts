export const clinicToolNames = [
  "get_service_availability",
  "find_appointment_slots",
  "prepare_booking",
  "confirm_booking",
  "request_staff_callback",
] as const;

export type ClinicToolName = (typeof clinicToolNames)[number];

export type AvailabilityStatus =
  | "available"
  | "unavailable"
  | "unknown"
  | "stale";

export interface ClinicToolFailure {
  status: "failed";
  message_for_caller: string;
}

export interface GetServiceAvailabilityInput {
  service: string;
  date: string;
}

export interface ServiceAvailabilityResult {
  status: AvailabilityStatus;
  service_id?: string;
  service_label: string;
  date: string;
  clinic_timezone: string;
  source_label?: string;
  updated_at?: string;
  message_for_caller?: string;
}

export type GetServiceAvailabilityOutput =
  | ServiceAvailabilityResult
  | ClinicToolFailure;

export interface FindAppointmentSlotsInput {
  service_id: string;
  date: string;
}

export interface AppointmentSlotOption {
  slot_id: string;
  starts_at: string;
  spoken_time: string;
}

export interface AlternativeAppointmentDate {
  date: string;
  spoken_date: string;
}

export interface AppointmentSlotsResult {
  status: "slots_found" | "no_slots";
  service_label: string;
  date: string;
  slots: readonly AppointmentSlotOption[];
  alternatives?: readonly AlternativeAppointmentDate[];
  message_for_caller?: string;
}

export type FindAppointmentSlotsOutput =
  | AppointmentSlotsResult
  | ClinicToolFailure;

export interface PrepareBookingInput {
  slot_id: string;
}

export interface BookingProposal {
  service_label: string;
  date: string;
  spoken_time: string;
}

export interface PrepareBookingResult {
  status: "prepared" | "slot_unavailable";
  booking_intent_id?: string;
  expires_at?: string;
  proposal?: BookingProposal;
  message_for_caller?: string;
}

export type PrepareBookingOutput = PrepareBookingResult | ClinicToolFailure;

export interface ConfirmBookingInput {
  booking_intent_id: string;
}

export interface ConfirmBookingResult {
  status: "confirmed" | "slot_unavailable" | "confirmation_required";
  appointment?: BookingProposal;
  alternatives?: readonly AppointmentSlotOption[];
  message_for_caller?: string;
}

export type ConfirmBookingOutput = ConfirmBookingResult | ClinicToolFailure;

export interface RequestStaffCallbackInput {
  service: string;
  requested_date?: string;
  alternate_callback_number?: string;
}

export interface StaffCallbackResult {
  status: "pending_callback" | "confirmation_required";
  callback_request_id?: string;
  message_for_caller?: string;
}

export type RequestStaffCallbackOutput = StaffCallbackResult | ClinicToolFailure;

export interface ClinicToolInputMap {
  get_service_availability: GetServiceAvailabilityInput;
  find_appointment_slots: FindAppointmentSlotsInput;
  prepare_booking: PrepareBookingInput;
  confirm_booking: ConfirmBookingInput;
  request_staff_callback: RequestStaffCallbackInput;
}

export interface ClinicToolOutputMap {
  get_service_availability: GetServiceAvailabilityOutput;
  find_appointment_slots: FindAppointmentSlotsOutput;
  prepare_booking: PrepareBookingOutput;
  confirm_booking: ConfirmBookingOutput;
  request_staff_callback: RequestStaffCallbackOutput;
}

export interface ClinicToolDefinition {
  type: "function";
  name: ClinicToolName;
  description: string;
  strict: true;
  parameters: Readonly<Record<string, unknown>>;
}

const objectSchema = (
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[],
): Readonly<Record<string, unknown>> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const clinicToolDefinitions: readonly ClinicToolDefinition[] = [
  {
    type: "function",
    name: "get_service_availability",
    description:
      "Check the clinic's current recorded availability for one service and date. Use for every new availability question.",
    strict: true,
    parameters: objectSchema(
      {
        service: {
          type: "string",
          description: "The clinic service requested by the caller.",
        },
        date: {
          type: "string",
          description: "Clinic-local calendar date in YYYY-MM-DD format.",
        },
      },
      ["service", "date"],
    ),
  },
  {
    type: "function",
    name: "find_appointment_slots",
    description:
      "Find currently bookable appointment slots for a service and date returned by an availability check.",
    strict: true,
    parameters: objectSchema(
      {
        service_id: { type: "string" },
        date: {
          type: "string",
          description: "Clinic-local calendar date in YYYY-MM-DD format.",
        },
      },
      ["service_id", "date"],
    ),
  },
  {
    type: "function",
    name: "prepare_booking",
    description:
      "Prepare an expiring booking proposal for spoken read-back. This does not create an appointment.",
    strict: true,
    parameters: objectSchema({ slot_id: { type: "string" } }, ["slot_id"]),
  },
  {
    type: "function",
    name: "confirm_booking",
    description:
      "Confirm a prepared booking only after the caller clearly confirms the complete read-back in a later turn.",
    strict: true,
    parameters: objectSchema(
      { booking_intent_id: { type: "string" } },
      ["booking_intent_id"],
    ),
  },
  {
    type: "function",
    name: "request_staff_callback",
    description:
      "Create one pending staff callback request when availability is unknown or stale, or a booking cannot be completed.",
    strict: true,
    parameters: objectSchema(
      {
        service: { type: "string" },
        requested_date: {
          type: ["string", "null"],
          description: "Clinic-local date in YYYY-MM-DD format, when provided.",
        },
        alternate_callback_number: {
          type: ["string", "null"],
          description:
            "A different callback number only when the caller explicitly supplies one.",
        },
      },
      ["service", "requested_date", "alternate_callback_number"],
    ),
  },
];

export type ClinicToolCall = {
  [Name in ClinicToolName]: {
    name: Name;
    arguments: ClinicToolInputMap[Name];
  };
}[ClinicToolName];

export type ClinicToolValidationResult =
  | { success: true; data: ClinicToolCall }
  | { success: false; issues: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
};

function optionalString(
  value: unknown,
  key: string,
  issues: string[],
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isNonEmptyString(value)) {
    issues.push(`${key} must be a non-empty string when provided`);
    return undefined;
  }
  return value.trim();
}

function rejectUnexpectedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  issues: string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`unexpected field: ${key}`);
  }
}

export function validateClinicToolCall(
  name: string,
  value: unknown,
): ClinicToolValidationResult {
  if (!clinicToolNames.includes(name as ClinicToolName)) {
    return { success: false, issues: [`unsupported clinic tool: ${name}`] };
  }
  if (!isRecord(value)) {
    return { success: false, issues: ["tool arguments must be a JSON object"] };
  }

  const issues: string[] = [];
  if (name === "get_service_availability") {
    rejectUnexpectedKeys(value, ["service", "date"], issues);
    if (!isNonEmptyString(value.service)) {
      issues.push("service must be a non-empty string");
    }
    if (!isDate(value.date)) issues.push("date must use YYYY-MM-DD");
    if (issues.length > 0) return { success: false, issues };
    return {
      success: true,
      data: {
        name,
        arguments: {
          service: (value.service as string).trim(),
          date: value.date as string,
        },
      },
    };
  }

  if (name === "find_appointment_slots") {
    rejectUnexpectedKeys(value, ["service_id", "date"], issues);
    if (!isNonEmptyString(value.service_id)) {
      issues.push("service_id must be a non-empty string");
    }
    if (!isDate(value.date)) issues.push("date must use YYYY-MM-DD");
    if (issues.length > 0) return { success: false, issues };
    return {
      success: true,
      data: {
        name,
        arguments: {
          service_id: (value.service_id as string).trim(),
          date: value.date as string,
        },
      },
    };
  }

  if (name === "prepare_booking") {
    rejectUnexpectedKeys(value, ["slot_id"], issues);
    if (issues.length > 0) return { success: false, issues };
    if (!isNonEmptyString(value.slot_id)) {
      return { success: false, issues: ["slot_id must be a non-empty string"] };
    }
    return {
      success: true,
      data: {
        name,
        arguments: { slot_id: value.slot_id.trim() },
      },
    };
  }

  if (name === "confirm_booking") {
    rejectUnexpectedKeys(value, ["booking_intent_id"], issues);
    if (issues.length > 0) return { success: false, issues };
    if (!isNonEmptyString(value.booking_intent_id)) {
      return {
        success: false,
        issues: ["booking_intent_id must be a non-empty string"],
      };
    }
    return {
      success: true,
      data: {
        name,
        arguments: { booking_intent_id: value.booking_intent_id.trim() },
      },
    };
  }

  rejectUnexpectedKeys(
    value,
    ["service", "requested_date", "alternate_callback_number"],
    issues,
  );
  if (!isNonEmptyString(value.service)) {
    issues.push("service must be a non-empty string");
  }
  if (
    value.requested_date !== undefined &&
    value.requested_date !== null &&
    !isDate(value.requested_date)
  ) {
    issues.push("requested_date must use YYYY-MM-DD when provided");
  }
  const alternateCallbackNumber = optionalString(
    value.alternate_callback_number,
    "alternate_callback_number",
    issues,
  );
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    data: {
      name: "request_staff_callback",
      arguments: {
        service: (value.service as string).trim(),
        ...(typeof value.requested_date === "string"
          ? { requested_date: value.requested_date }
          : {}),
        ...(alternateCallbackNumber
          ? { alternate_callback_number: alternateCallbackNumber }
          : {}),
      },
    },
  };
}