import {
  validateClinicToolCall,
  type ClinicToolName,
  type ClinicToolOutputMap,
} from "@tulu/shared";

import type {
  ClinicOperationContext,
  ClinicOperations,
} from "./clinic-operations.js";

export interface ClinicToolSessionContext {
  sessionId: string;
  clinicId: string;
  clinicTimezone: string;
  clinicLocalDate: string;
  callerNumber?: string;
}

export interface ClinicToolInvocation {
  sessionId: string;
  delegationId: string;
  toolCallId: string;
  name: string;
  argumentsJson: string;
}

export type ClinicToolResult = ClinicToolOutputMap[ClinicToolName];

interface BookingIntentState {
  taskRevision: number;
  preparedDelegationId: string;
  status: "prepared" | "confirmed";
}

interface CallbackRequestState {
  taskRevision: number;
  preparedDelegationId: string;
  serializedArguments: string;
}

interface ToolSessionState extends ClinicToolSessionContext {
  taskRevision: number;
  delegationRevisions: Map<string, number>;
  bookingIntents: Map<string, BookingIntentState>;
  callbackRequest?: CallbackRequestState;
  resultsByToolCallId: Map<string, ClinicToolResult>;
}

const failed = (message: string): ClinicToolResult => ({
  status: "failed",
  message_for_caller: message,
});

export class ClinicToolExecutor {
  readonly #sessions = new Map<string, ToolSessionState>();

  constructor(private readonly operations: ClinicOperations) {}

  registerSession(context: ClinicToolSessionContext): void {
    if (this.#sessions.has(context.sessionId)) return;
    this.#sessions.set(context.sessionId, {
      ...context,
      taskRevision: 0,
      delegationRevisions: new Map(),
      bookingIntents: new Map(),
      resultsByToolCallId: new Map(),
    });
  }

  noteDelegation(sessionId: string, delegationId: string): void {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Unknown Live session: ${sessionId}`);
    session.delegationRevisions.set(delegationId, session.taskRevision);
  }

  closeSession(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }

  async execute(invocation: ClinicToolInvocation): Promise<ClinicToolResult> {
    const session = this.#sessions.get(invocation.sessionId);
    if (!session) {
      return failed("This clinic session is no longer available.");
    }

    const cached = session.resultsByToolCallId.get(invocation.toolCallId);
    if (cached) return cached;

    let rawArguments: unknown;
    try {
      rawArguments = JSON.parse(invocation.argumentsJson);
    } catch {
      return this.#cache(
        session,
        invocation.toolCallId,
        failed("I need to clarify that information before continuing."),
      );
    }

    const validated = validateClinicToolCall(invocation.name, rawArguments);
    if (!validated.success) {
      return this.#cache(
        session,
        invocation.toolCallId,
        failed("I need to clarify that information before continuing."),
      );
    }

    if (validated.data.name === "get_service_availability") {
      session.taskRevision += 1;
      session.delegationRevisions.set(
        invocation.delegationId,
        session.taskRevision,
      );
      session.bookingIntents.clear();
      session.callbackRequest = undefined;
    }

    const taskRevision =
      session.delegationRevisions.get(invocation.delegationId) ??
      session.taskRevision;
    if (taskRevision !== session.taskRevision) {
      return this.#cache(
        session,
        invocation.toolCallId,
        failed("The request changed, so I did not use the older result."),
      );
    }

    const context = this.#operationContext(
      session,
      taskRevision,
      invocation,
      validated.data.name,
    );

    try {
      let result: ClinicToolResult;
      switch (validated.data.name) {
        case "get_service_availability":
          result = await this.operations.getServiceAvailability(
            context,
            validated.data.arguments,
          );
          break;
        case "find_appointment_slots":
          result = await this.operations.findAppointmentSlots(
            context,
            validated.data.arguments,
          );
          break;
        case "prepare_booking": {
          result = await this.operations.prepareBooking(
            context,
            validated.data.arguments,
          );
          if (
            result.status === "prepared" &&
            typeof result.booking_intent_id === "string"
          ) {
            session.bookingIntents.set(result.booking_intent_id, {
              taskRevision,
              preparedDelegationId: invocation.delegationId,
              status: "prepared",
            });
          }
          break;
        }
        case "confirm_booking": {
          const intent = session.bookingIntents.get(
            validated.data.arguments.booking_intent_id,
          );
          if (
            !intent ||
            intent.taskRevision !== taskRevision ||
            (intent.status === "prepared" &&
              intent.preparedDelegationId === invocation.delegationId)
          ) {
            result = {
              status: "confirmation_required",
              message_for_caller:
                "Please read back the appointment and ask for a clear yes or no before booking.",
            };
            break;
          }
          result = await this.operations.confirmBooking(
            {
              ...context,
              operationId: `booking:${invocation.sessionId}:${validated.data.arguments.booking_intent_id}`,
            },
            validated.data.arguments,
          );
          if (result.status === "confirmed") intent.status = "confirmed";
          break;
        }
        case "request_staff_callback": {
          const serializedArguments = JSON.stringify(validated.data.arguments);
          const callbackRequest = session.callbackRequest;
          if (
            !callbackRequest ||
            callbackRequest.taskRevision !== taskRevision ||
            callbackRequest.serializedArguments !== serializedArguments
          ) {
            session.callbackRequest = {
              taskRevision,
              preparedDelegationId: invocation.delegationId,
              serializedArguments,
            };
            result = {
              status: "confirmation_required",
              message_for_caller:
                "Please read back the callback request and ask for a clear yes or no before submitting it.",
            };
            break;
          }
          if (callbackRequest.preparedDelegationId === invocation.delegationId) {
            result = {
              status: "confirmation_required",
              message_for_caller:
                "Please ask for a clear yes or no before submitting the callback request.",
            };
            break;
          }
          result = await this.operations.requestStaffCallback(
            {
              ...context,
              operationId: `callback:${invocation.sessionId}:${taskRevision}`,
            },
            validated.data.arguments,
          );
          break;
        }
      }

      if (taskRevision !== session.taskRevision) {
        return this.#cache(
          session,
          invocation.toolCallId,
          failed("The request changed, so I did not use the older result."),
        );
      }
      return this.#cache(session, invocation.toolCallId, result);
    } catch {
      return this.#cache(
        session,
        invocation.toolCallId,
        failed("I could not complete that request."),
      );
    }
  }

  #operationContext(
    session: ToolSessionState,
    taskRevision: number,
    invocation: ClinicToolInvocation,
    toolName: ClinicToolName,
  ): ClinicOperationContext {
    return {
      sessionId: session.sessionId,
      clinicId: session.clinicId,
      clinicTimezone: session.clinicTimezone,
      clinicLocalDate: session.clinicLocalDate,
      taskRevision,
      operationId: [
        "tool",
        session.sessionId,
        taskRevision,
        toolName,
        invocation.toolCallId,
      ].join(":"),
      ...(session.callerNumber
        ? { callerNumber: session.callerNumber }
        : {}),
    };
  }

  #cache(
    session: ToolSessionState,
    toolCallId: string,
    result: ClinicToolResult,
  ): ClinicToolResult {
    session.resultsByToolCallId.set(toolCallId, result);
    return result;
  }
}