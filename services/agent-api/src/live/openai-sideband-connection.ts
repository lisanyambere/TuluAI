import OpenAI from "openai";
import { SidebandWS } from "openai/resources/live/sideband/ws";
import type {
  ConnectClientEvent,
} from "openai/resources/live/sideband/sideband";

import type {
  SidebandConnection,
  SidebandConnectionFactory,
  SidebandResponseEvent,
} from "./sideband-controller.js";

class OpenAISidebandConnection implements SidebandConnection {
  private readonly readyPromise: Promise<void>;

  constructor(private readonly socket: SidebandWS) {
    this.readyPromise = this.waitUntilOpen();
  }

  send(event: Readonly<Record<string, unknown>>): void {
    this.socket.send(event as unknown as ConnectClientEvent);
  }

  close(): void {
    this.socket.close({ code: 1000, reason: "Tulu server shutdown" });
  }

  async whenReady(timeoutMs: number): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Live sideband readiness timed out")),
        timeoutMs,
      );
      timeout.unref();
    });

    try {
      await Promise.race([this.readyPromise, timedOut]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  onResponseEvent(listener: (event: SidebandResponseEvent) => void): void {
    this.socket.on("response.event", (event) => listener(event));
  }

  onSessionClosed(listener: () => void): void {
    this.socket.on("session.closed", listener);
  }

  onClose(listener: () => void): void {
    this.socket.on("close", listener);
  }

  onError(listener: (error: unknown) => void): void {
    this.socket.on("error", listener);
  }

  private async waitUntilOpen(): Promise<void> {
    for await (const event of this.socket.stream()) {
      if (event.type === "open" || event.type === "reconnected") return;
      if (event.type === "close") {
        throw new Error("Live sideband closed before opening");
      }
    }
    throw new Error("Live sideband ended before opening");
  }
}

export function createOpenAISidebandConnectionFactory(
  apiKey: string,
): SidebandConnectionFactory {
  const client = new OpenAI({ apiKey, maxRetries: 0 });

  return {
    connect(sessionId: string): SidebandConnection {
      const socket = new SidebandWS(
        client,
        { session_id: sessionId, graceful_close: true },
        {
          reconnect: {
            maxRetries: 3,
            initialDelay: 500,
            maxDelay: 4_000,
            onReconnecting: () => undefined,
          },
        },
      );

      return new OpenAISidebandConnection(socket);
    },
  };
}
