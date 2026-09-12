import {
  clinicToolDefinitions,
  type ClinicToolDefinition,
  type SupportedLanguage,
} from "@tulu/shared";
import type OpenAI from "openai";
import type {
  ConnectClientEvent,
  ConnectServerEvent,
} from "openai/resources/live/sideband/sideband";
import { SidebandWS } from "openai/resources/live/sideband/ws";

import type { SafeLogger } from "../app.js";
import type {
  ClinicToolExecutor,
  ClinicToolSessionContext,
} from "../tools/clinic-tool-executor.js";
import type {
  LiveToolAttachment,
  LiveToolRuntime,
} from "./live-tool-runtime.js";

export interface LiveSidebandConnection {
  send(event: ConnectClientEvent): void;
  stream(): ReturnType<SidebandWS["stream"]>;
  close(props?: { code: number; reason: string }): void;
}

interface FunctionCallItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

type ToolSessionContextFactory = (
  input: LiveToolAttachment,
) => ClinicToolSessionContext;

type SidebandFactory = (
  client: OpenAI,
  sessionId: string,
) => LiveSidebandConnection;

const isFunctionCallItem = (value: unknown): value is FunctionCallItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    item.type === "function_call" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
};

const defaultLogger: SafeLogger = {
  info: (message, context) => console.info(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {}),
};

export async function runClinicToolSideband(
  sessionId: string,
  connection: LiveSidebandConnection,
  executor: ClinicToolExecutor,
  logger: SafeLogger = defaultLogger,
): Promise<void> {
  try {
    for await (const frame of connection.stream()) {
      if (frame.type === "error") {
        logger.error("Live tool sideband error", { sessionId });
        continue;
      }
      if (frame.type !== "message") continue;

      const event: ConnectServerEvent = frame.message;
      if (event.type === "session.delegation.created") {
        executor.noteDelegation(sessionId, event.delegation.id);
        continue;
      }
      if (event.type === "session.closed") break;
      if (event.type !== "response.event") continue;

      const nested = event.event;
      if (nested.type !== "response.output_item.done") continue;
      if (!isFunctionCallItem(nested.item)) continue;
      if (!event.delegation_id) {
        logger.error("Tool call missing delegation ID", { sessionId });
        continue;
      }

      const result = await executor.execute({
        sessionId,
        delegationId: event.delegation_id,
        toolCallId: nested.item.call_id,
        name: nested.item.name,
        argumentsJson: nested.item.arguments,
      });
      connection.send({
        type: "response.item.create",
        item: {
          type: "function_call_output",
          call_id: nested.item.call_id,
          output: JSON.stringify(result),
        },
      });
      connection.send({ type: "response.create" });
    }
  } finally {
    executor.closeSession(sessionId);
    connection.close({ code: 1000, reason: "Live session ended" });
  }
}

export class ClinicLiveToolRuntime implements LiveToolRuntime {
  readonly enabled = true;
  readonly definitions: readonly ClinicToolDefinition[] = clinicToolDefinitions;

  constructor(
    private readonly client: OpenAI,
    private readonly executor: ClinicToolExecutor,
    private readonly createSessionContext: ToolSessionContextFactory,
    private readonly createSideband: SidebandFactory = (client, sessionId) =>
      new SidebandWS(client, { session_id: sessionId }),
    private readonly logger: SafeLogger = defaultLogger,
  ) {}

  attach(input: { sessionId: string; language: SupportedLanguage }): void {
    this.executor.registerSession(this.createSessionContext(input));
    const connection = this.createSideband(this.client, input.sessionId);
    void runClinicToolSideband(
      input.sessionId,
      connection,
      this.executor,
      this.logger,
    ).catch(() => {
      this.logger.error("Live tool sideband stopped unexpectedly", {
        sessionId: input.sessionId,
      });
    });
  }
}