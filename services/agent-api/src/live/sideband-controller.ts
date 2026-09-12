import { randomUUID } from "node:crypto";

import type { SafeLogger } from "../app.js";
import type { OperationalToolExecutor } from "../operations/tools.js";

export interface SidebandResponseEvent {
  type: "response.event";
  delegation_id?: string | null;
  event: unknown;
}

export interface SidebandConnection {
  send(event: Readonly<Record<string, unknown>>): void;
  close(): void;
  whenReady(timeoutMs: number): Promise<void>;
  onResponseEvent(listener: (event: SidebandResponseEvent) => void): void;
  onSessionClosed(listener: () => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: unknown) => void): void;
}

export interface SidebandConnectionFactory {
  connect(sessionId: string): SidebandConnection;
}

interface FunctionCall {
  callId: string;
  name: string;
  arguments: string;
}

interface DelegatedRun {
  responseId: string | null;
  calls: Map<string, FunctionCall>;
}

interface SessionState {
  connection: SidebandConnection;
  active: boolean;
  runs: Map<string, DelegatedRun>;
  callResults: Map<string, Promise<string>>;
  processedRuns: Set<string>;
}

const MAX_TOOL_CALLS_PER_RESPONSE = 8;
const MAX_REMEMBERED_CALLS = 128;
const MAX_REMEMBERED_RUNS = 128;
const SIDEBAND_READY_TIMEOUT_MS = 8_000;

const silentLogger: SafeLogger = { info: () => {}, error: () => {} };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(
  record: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const value = record?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function boundedAdd(set: Set<string>, value: string, maximum: number): void {
  set.add(value);
  while (set.size > maximum) {
    const oldest = set.values().next().value as string | undefined;
    if (oldest === undefined) return;
    set.delete(oldest);
  }
}

function boundedSet<T>(map: Map<string, T>, key: string, value: T): void {
  map.set(key, value);
  while (map.size > MAX_REMEMBERED_CALLS) {
    const oldest = map.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    map.delete(oldest);
  }
}

function toolLimitOutput(): string {
  return JSON.stringify({
    ok: false,
    error: {
      code: "tool_limit_exceeded",
      message: "Too many lookups were requested in one response.",
    },
  });
}

function toolFailureOutput(): string {
  return JSON.stringify({
    ok: false,
    error: {
      code: "tool_failed",
      message: "The lookup could not be completed.",
    },
  });
}

/**
 * Owns privileged tool execution for each Live session. Browser data-channel
 * permissions never include response.item.create or response.create, so only
 * this server-side connection can return tool results to the delegated model.
 */
export class LiveSidebandController {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly factory: SidebandConnectionFactory,
    private readonly tools: OperationalToolExecutor,
    private readonly logger: SafeLogger = silentLogger,
  ) {}

  async attach(sessionId: string): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      await existing.connection.whenReady(SIDEBAND_READY_TIMEOUT_MS);
      return;
    }

    const connection = this.factory.connect(sessionId);
    const state: SessionState = {
      connection,
      active: true,
      runs: new Map(),
      callResults: new Map(),
      processedRuns: new Set(),
    };
    this.sessions.set(sessionId, state);

    connection.onResponseEvent((event) => {
      void this.handleResponseEvent(sessionId, state, event);
    });
    connection.onSessionClosed(() => this.detach(sessionId, state));
    connection.onClose(() => this.forget(sessionId, state));
    connection.onError(() => {
      this.logger.error("Live sideband connection error");
    });

    try {
      await connection.whenReady(SIDEBAND_READY_TIMEOUT_MS);
      if (!state.active || this.sessions.get(sessionId) !== state) {
        throw new Error("Live sideband closed before becoming ready");
      }
      this.logger.info("Live sideband attached");
    } catch {
      this.detach(sessionId, state);
      throw new Error("Live sideband could not become ready");
    }
  }

  closeAll(): void {
    for (const [sessionId, state] of this.sessions) {
      this.detach(sessionId, state);
    }
  }

  private detach(sessionId: string, state: SessionState): void {
    if (!this.forget(sessionId, state)) return;
    try {
      state.connection.close();
    } catch {
      this.logger.error("Live sideband close failed");
    }
  }

  private forget(sessionId: string, state: SessionState): boolean {
    if (this.sessions.get(sessionId) !== state) return false;
    state.active = false;
    state.runs.clear();
    state.callResults.clear();
    state.processedRuns.clear();
    this.sessions.delete(sessionId);
    return true;
  }

  private async handleResponseEvent(
    sessionId: string,
    state: SessionState,
    envelope: SidebandResponseEvent,
  ): Promise<void> {
    if (!state.active || this.sessions.get(sessionId) !== state) return;

    const delegationId = envelope.delegation_id;
    if (typeof delegationId !== "string" || delegationId.length === 0) return;

    const nested = asRecord(envelope.event);
    const type = stringField(nested, "type");
    if (!type) return;

    if (type === "response.created") {
      const response = asRecord(nested?.response);
      state.runs.set(delegationId, {
        responseId: stringField(response, "id") ?? null,
        calls: new Map(),
      });
      return;
    }

    if (type === "response.output_item.done") {
      const item = asRecord(nested?.item);
      if (item?.type !== "function_call") return;

      const callId = stringField(item, "call_id");
      const name = stringField(item, "name");
      const argumentsValue = item.arguments;
      if (!callId || !name || typeof argumentsValue !== "string") return;

      const run = state.runs.get(delegationId) ?? {
        responseId: null,
        calls: new Map<string, FunctionCall>(),
      };
      run.calls.set(callId, { callId, name, arguments: argumentsValue });
      state.runs.set(delegationId, run);
      return;
    }

    if (
      type === "response.failed" ||
      type === "response.incomplete" ||
      type === "response.cancelled" ||
      type === "error"
    ) {
      state.runs.delete(delegationId);
      return;
    }

    if (type !== "response.completed") return;

    const run = state.runs.get(delegationId);
    state.runs.delete(delegationId);
    if (!run || run.calls.size === 0) return;

    const response = asRecord(nested?.response);
    const responseId = stringField(response, "id") ?? run.responseId ?? "unknown";
    const runKey = `${delegationId}:${responseId}`;
    if (state.processedRuns.has(runKey)) return;
    boundedAdd(state.processedRuns, runKey, MAX_REMEMBERED_RUNS);

    const calls = [...run.calls.values()];
    const results = await Promise.all(
      calls.map((call, index) =>
        this.resultForCall(
          state,
          call,
          index < MAX_TOOL_CALLS_PER_RESPONSE,
        ),
      ),
    );

    if (!state.active || this.sessions.get(sessionId) !== state) return;

    try {
      for (let index = 0; index < calls.length; index += 1) {
        const call = calls[index];
        const output = results[index];
        if (!call || output === undefined) continue;

        state.connection.send({
          type: "response.item.create",
          event_id: randomUUID(),
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output,
          },
        });
      }

      state.connection.send({
        type: "response.create",
        event_id: randomUUID(),
      });
      this.logger.info("Live delegated tools completed", {
        toolCallCount: calls.length,
      });
    } catch {
      this.logger.error("Live sideband tool result delivery failed");
    }
  }

  private resultForCall(
    state: SessionState,
    call: FunctionCall,
    withinLimit: boolean,
  ): Promise<string> {
    const existing = state.callResults.get(call.callId);
    if (existing) return existing;

    const result = withinLimit
      ? this.tools
          .execute(call.name, call.arguments)
          .then((value) => value.output, () => toolFailureOutput())
      : Promise.resolve(toolLimitOutput());
    boundedSet(state.callResults, call.callId, result);
    return result;
  }
}
