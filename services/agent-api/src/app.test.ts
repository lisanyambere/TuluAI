import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import { createApiHandler, type SafeLogger } from "./app.js";
import type { AgentApiConfig } from "./config.js";
import type {
  CreateLiveSessionInput,
  LiveSessionClient,
} from "./live/live-session-client.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

const allowedOrigin = "http://localhost:5173";
const config: AgentApiConfig = {
  host: "127.0.0.1",
  port: 8787,
  openAIApiKey: "unused-in-mocked-tests",
  liveModel: "gpt-live-1",
  backendModel: "gpt-5.6-terra",
  allowedOrigins: new Set([allowedOrigin]),
  rateLimitWindowMs: 60_000,
  rateLimitMax: 6,
  trustProxy: false,
};
const silentLogger: SafeLogger = { info: () => {}, error: () => {} };
const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

async function startServer(liveSessionClient: LiveSessionClient, rateLimiter?: FixedWindowRateLimiter) {
  const server = createServer(
    createApiHandler({ config, liveSessionClient, rateLimiter, logger: silentLogger }),
  );
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function mockClient(
  create: (input: CreateLiveSessionInput) => Promise<{
    session: { id: string };
    transport: { type: "webrtc"; sdp: string };
  }> = async () => ({
    session: { id: "sess_test" },
    transport: { type: "webrtc", sdp: "answer-sdp" },
  }),
): LiveSessionClient {
  return { create };
}

describe("Tulu agent API", () => {
  it("reports health without contacting OpenAI", async () => {
    let calls = 0;
    const baseUrl = await startServer(
      mockClient(async () => {
        calls += 1;
        throw new Error("must not be called");
      }),
    );

    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "tulu-agent-api",
    });
    assert.equal(calls, 0);
  });

  it("rejects an unapproved browser origin", async () => {
    const baseUrl = await startServer(mockClient());

    const response = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "en",
        consentAcknowledged: true,
      }),
    });
    const body = (await response.json()) as { error: { code: string } };

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "origin_forbidden");
  });

  it("requires explicit demo consent", async () => {
    const baseUrl = await startServer(mockClient());

    const response = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "en",
        consentAcknowledged: false,
      }),
    });
    const body = (await response.json()) as {
      error: { code: string; issues: string[] };
    };

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "invalid_request");
    assert.ok(body.error.issues.includes("consentAcknowledged must be true"));
  });

  it("creates a Kiswahili GPT-Live session and preserves the response contract", async () => {
    let received: CreateLiveSessionInput | undefined;
    const baseUrl = await startServer(
      mockClient(async (input) => {
        received = input;
        return {
          session: { id: "sess_123" },
          transport: { type: "webrtc", sdp: "answer-sdp" },
        };
      }),
    );

    const response = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "sw",
        consentAcknowledged: true,
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.deepEqual(await response.json(), {
      session: { id: "sess_123" },
      transport: { type: "webrtc", sdp: "answer-sdp" },
    });
    assert.equal(received?.sdp, "offer-sdp");
    assert.equal(received?.language, "sw");
    assert.equal(received?.liveModel, "gpt-live-1");
    assert.equal(received?.backendModel, "gpt-5.6-terra");
    assert.match(received?.liveInstructions ?? "", /Kiswahili/);
    assert.match(received?.backendInstructions ?? "", /No custom functions/);
  });

  it("limits repeated chargeable session creation attempts", async () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    const baseUrl = await startServer(mockClient(), limiter);
    const request = () =>
      fetch(`${baseUrl}/api/live/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: allowedOrigin },
        body: JSON.stringify({
          sdp: "offer-sdp",
          language: "en",
          consentAcknowledged: true,
        }),
      });

    assert.equal((await request()).status, 201);
    const response = await request();
    const body = (await response.json()) as { error: { code: string } };

    assert.equal(response.status, 429);
    assert.equal(body.error.code, "rate_limited");
    assert.equal(response.headers.get("ratelimit-remaining"), "0");
  });

  it("does not expose an upstream error message", async () => {
    const baseUrl = await startServer(
      mockClient(async () => {
        throw new Error("sensitive upstream details");
      }),
    );

    const response = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "en",
        consentAcknowledged: true,
      }),
    });
    const serialized = JSON.stringify(await response.json());

    assert.equal(response.status, 502);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.doesNotMatch(serialized, /sensitive upstream details/);
  });
});
