import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OperationalToolExecutionResult } from "./operations/tools.js";
import {
  LiveSidebandController,
  type SidebandConnection,
  type SidebandConnectionFactory,
  type SidebandResponseEvent,
} from "./live/sideband-controller.js";

type ResponseListener = (event: SidebandResponseEvent) => void;

class FakeConnection implements SidebandConnection {
  readonly sent: Readonly<Record<string, unknown>>[] = [];
  closeCalls = 0;
  readyPromise: Promise<void> = Promise.resolve();

  private responseListener: ResponseListener = () => {};
  private sessionClosedListener = () => {};
  private closeListener = () => {};
  private errorListener: (error: unknown) => void = () => {};

  send(event: Readonly<Record<string, unknown>>): void {
    this.sent.push(event);
  }

  close(): void {
    this.closeCalls += 1;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  onResponseEvent(listener: ResponseListener): void {
    this.responseListener = listener;
  }

  onSessionClosed(listener: () => void): void {
    this.sessionClosedListener = listener;
  }

  onClose(listener: () => void): void {
    this.closeListener = listener;
  }

  onError(listener: (error: unknown) => void): void {
    this.errorListener = listener;
  }

  emitResponse(event: SidebandResponseEvent): void {
    this.responseListener(event);
  }

  emitSessionClosed(): void {
    this.sessionClosedListener();
  }

  emitClose(): void {
    this.closeListener();
  }

  emitError(error: unknown): void {
    this.errorListener(error);
  }
}

class FakeFactory implements SidebandConnectionFactory {
  readonly connection = new FakeConnection();
  readonly sessionIds: string[] = [];

  connect(sessionId: string): SidebandConnection {
    this.sessionIds.push(sessionId);
    return this.connection;
  }
}

interface ToolInvocation {
  name: string;
  arguments: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      assert.ok(resolvePromise);
      resolvePromise(value);
    },
  };
}

function envelope(
  delegationId: string,
  event: Record<string, unknown>,
): SidebandResponseEvent {
  return {
    type: "response.event",
    delegation_id: delegationId,
    event,
  };
}

function created(delegationId = "delegation-1", responseId = "response-1") {
  return envelope(delegationId, {
    type: "response.created",
    response: { id: responseId },
  });
}

function outputItemDone(
  callId: string,
  name: string,
  argumentsValue: string,
  delegationId = "delegation-1",
) {
  return envelope(delegationId, {
    type: "response.output_item.done",
    item: {
      type: "function_call",
      call_id: callId,
      name,
      arguments: argumentsValue,
    },
  });
}

function completed(
  delegationId = "delegation-1",
  responseId = "response-1",
) {
  return envelope(delegationId, {
    type: "response.completed",
    response: { id: responseId },
  });
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("LiveSidebandController", () => {
  it("does not report attachment success when the privileged connection fails", async () => {
    const factory = new FakeFactory();
    factory.connection.readyPromise = Promise.reject(
      new Error("private transport detail"),
    );
    const controller = new LiveSidebandController(factory, {
      async execute() {
        return { ok: true, output: "unused" };
      },
    });

    await assert.rejects(
      controller.attach("session-1"),
      /Live sideband could not become ready/,
    );
    assert.equal(factory.connection.closeCalls, 1);
  });

  it("collects calls only from output_item.done and waits for response.completed", async () => {
    const factory = new FakeFactory();
    const invocations: ToolInvocation[] = [];
    const tools = {
      async execute(
        name: string,
        argumentsValue: string,
      ): Promise<OperationalToolExecutionResult> {
        invocations.push({ name, arguments: argumentsValue });
        return { ok: true, output: JSON.stringify({ ok: true, name }) };
      },
    };
    const controller = new LiveSidebandController(factory, tools);
    controller.attach("session-1");

    factory.connection.emitResponse(created());
    factory.connection.emitResponse(
      envelope("delegation-1", {
        type: "response.function_call_arguments.done",
        call_id: "ignored-arguments-event",
        name: "check_inventory",
        arguments: "{}",
      }),
    );
    factory.connection.emitResponse(
      envelope("delegation-1", {
        type: "response.output_item.done",
        item: { type: "message", id: "ignored-message" },
      }),
    );
    factory.connection.emitResponse(
      outputItemDone(
        "call-1",
        "check_inventory",
        JSON.stringify({ item: "oral rehydration salts" }),
      ),
    );

    await flushAsyncWork();
    assert.deepEqual(invocations, []);
    assert.equal(factory.connection.sent.length, 0);

    factory.connection.emitResponse(completed());
    await flushAsyncWork();

    assert.deepEqual(invocations, [
      {
        name: "check_inventory",
        arguments: JSON.stringify({ item: "oral rehydration salts" }),
      },
    ]);
    assert.equal(factory.connection.sent.length, 2);
    assert.equal(factory.connection.sent[0]?.type, "response.item.create");
    assert.deepEqual(factory.connection.sent[0]?.item, {
      type: "function_call_output",
      call_id: "call-1",
      output: JSON.stringify({ ok: true, name: "check_inventory" }),
    });
    assert.equal(factory.connection.sent[1]?.type, "response.create");
  });

  it("starts independent tool calls in parallel and continues exactly once", async () => {
    const factory = new FakeFactory();
    const invocations: ToolInvocation[] = [];
    const pending = [
      deferred<OperationalToolExecutionResult>(),
      deferred<OperationalToolExecutionResult>(),
    ];
    const tools = {
      execute(name: string, argumentsValue: string) {
        invocations.push({ name, arguments: argumentsValue });
        const next = pending[invocations.length - 1];
        assert.ok(next);
        return next.promise;
      },
    };
    const controller = new LiveSidebandController(factory, tools);
    controller.attach("session-1");

    factory.connection.emitResponse(created());
    factory.connection.emitResponse(
      outputItemDone("call-1", "find_facilities", "{}"),
    );
    factory.connection.emitResponse(
      outputItemDone(
        "call-2",
        "check_service_availability",
        JSON.stringify({ service: "general consultation" }),
      ),
    );
    factory.connection.emitResponse(completed());
    await flushAsyncWork();

    assert.equal(invocations.length, 2);
    assert.equal(factory.connection.sent.length, 0);

    pending[0]?.resolve({ ok: true, output: "first-output" });
    await flushAsyncWork();
    assert.equal(factory.connection.sent.length, 0);

    pending[1]?.resolve({ ok: true, output: "second-output" });
    await flushAsyncWork();

    assert.deepEqual(
      factory.connection.sent.map((event) => event.type),
      ["response.item.create", "response.item.create", "response.create"],
    );
    assert.deepEqual(
      factory.connection.sent
        .filter((event) => event.type === "response.create"),
      [
        {
          type: "response.create",
          event_id: factory.connection.sent[2]?.event_id,
        },
      ],
    );
  });

  it("deduplicates repeated call IDs and completed events", async () => {
    const factory = new FakeFactory();
    const invocations: ToolInvocation[] = [];
    const tools = {
      async execute(name: string, argumentsValue: string) {
        invocations.push({ name, arguments: argumentsValue });
        return { ok: true, output: "deduplicated-output" };
      },
    };
    const controller = new LiveSidebandController(factory, tools);
    controller.attach("session-1");

    factory.connection.emitResponse(created());
    factory.connection.emitResponse(
      outputItemDone("same-call", "find_facilities", '{"query":"old"}'),
    );
    factory.connection.emitResponse(
      outputItemDone("same-call", "find_facilities", '{"query":"new"}'),
    );
    factory.connection.emitResponse(completed());
    factory.connection.emitResponse(completed());
    await flushAsyncWork();

    assert.deepEqual(invocations, [
      { name: "find_facilities", arguments: '{"query":"new"}' },
    ]);
    assert.deepEqual(
      factory.connection.sent.map((event) => event.type),
      ["response.item.create", "response.create"],
    );
  });

  it("does not send tool outputs after the sideband closes", async () => {
    const factory = new FakeFactory();
    const pending = deferred<OperationalToolExecutionResult>();
    const tools = {
      execute() {
        return pending.promise;
      },
    };
    const controller = new LiveSidebandController(factory, tools);
    controller.attach("session-1");

    factory.connection.emitResponse(created());
    factory.connection.emitResponse(
      outputItemDone("call-1", "find_facilities", "{}"),
    );
    factory.connection.emitResponse(completed());
    await flushAsyncWork();

    factory.connection.emitClose();
    pending.resolve({ ok: true, output: "too-late" });
    await flushAsyncWork();

    assert.equal(factory.connection.sent.length, 0);
  });

  it("turns an unexpected executor rejection into a safe result and continues", async () => {
    const factory = new FakeFactory();
    const tools = {
      async execute(): Promise<OperationalToolExecutionResult> {
        throw new Error("sensitive repository failure");
      },
    };
    const controller = new LiveSidebandController(factory, tools);
    controller.attach("session-1");

    factory.connection.emitResponse(created());
    factory.connection.emitResponse(
      outputItemDone("call-1", "find_facilities", "{}"),
    );
    factory.connection.emitResponse(completed());
    await flushAsyncWork();

    const serialized = JSON.stringify(factory.connection.sent);
    assert.deepEqual(
      factory.connection.sent.map((event) => event.type),
      ["response.item.create", "response.create"],
    );
    assert.match(serialized, /tool_failed/);
    assert.doesNotMatch(serialized, /sensitive repository failure/);
  });
});
