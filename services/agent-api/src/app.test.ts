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
  operationsAllowedOrigins: new Set([allowedOrigin]),
  rateLimitWindowMs: 60_000,
  rateLimitMax: 6,
  operationsRateLimitWindowMs: 60_000,
  operationsRateLimitMax: 120,
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

async function startServer(
  liveSessionClient: LiveSessionClient,
  rateLimiter?: FixedWindowRateLimiter,
  operationsRateLimiter?: FixedWindowRateLimiter,
  handlerConfig: AgentApiConfig = config,
) {
  const server = createServer(
    createApiHandler({
      config: handlerConfig,
      liveSessionClient,
      rateLimiter,
      operationsRateLimiter,
      logger: silentLogger,
    }),
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

  it("serves one explicitly synthetic operational snapshot without contacting OpenAI", async () => {
    let calls = 0;
    const baseUrl = await startServer(
      mockClient(async () => {
        calls += 1;
        throw new Error("must not be called");
      }),
    );

    const response = await fetch(`${baseUrl}/api/v1/operations/snapshot`);
    const body = (await response.json()) as {
      synthetic: boolean;
      datasetVersion: string;
      facilities: Array<{ name: string; synthetic: boolean }>;
      services: unknown[];
      inventory: unknown[];
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-tulu-data-mode"), "synthetic");
    assert.equal(response.headers.get("x-tulu-dataset-version"), "1");
    assert.equal(body.synthetic, true);
    assert.equal(body.datasetVersion, "1");
    assert.ok(body.facilities.length > 0);
    assert.ok(body.facilities.every((facility) => facility.synthetic));
    assert.ok(body.facilities.every((facility) => /demo/i.test(facility.name)));
    assert.ok(body.services.length > 0);
    assert.ok(body.inventory.length > 0);
    assert.equal(calls, 0);
  });

  it("exposes validated read-only lookup routes to an approved dashboard origin", async () => {
    const baseUrl = await startServer(mockClient());

    const response = await fetch(
      `${baseUrl}/api/v1/operations/service-availability?service=general%20consultation&location=north%20ridge`,
      { headers: { Origin: allowedOrigin } },
    );
    const body = (await response.json()) as {
      synthetic: boolean;
      count: number;
      matches: Array<{ facility: { id: string } }>;
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(body.synthetic, true);
    assert.equal(body.count, 1);
    assert.equal(
      body.matches[0]?.facility.id,
      "facility-north-ridge-demo",
    );
  });

  it("rejects unexpected operational query fields and non-read methods", async () => {
    const baseUrl = await startServer(mockClient());

    const invalidQuery = await fetch(
      `${baseUrl}/api/v1/operations/inventory?item=salts&patientName=private`,
    );
    const invalidBody = (await invalidQuery.json()) as {
      error: { code: string; issues: string[] };
    };
    assert.equal(invalidQuery.status, 400);
    assert.equal(invalidBody.error.code, "invalid_request");
    assert.deepEqual(invalidBody.error.issues, [
      "unexpected query parameter: patientName",
    ]);

    const mutation = await fetch(`${baseUrl}/api/v1/operations/snapshot`, {
      method: "POST",
    });
    assert.equal(mutation.status, 405);
    assert.equal(mutation.headers.get("allow"), "GET, OPTIONS");
  });

  it("keeps operations-read rate limits separate from Live session limits", async () => {
    const baseUrl = await startServer(
      mockClient(),
      new FixedWindowRateLimiter(1, 60_000),
      new FixedWindowRateLimiter(1, 60_000),
    );

    assert.equal(
      (await fetch(`${baseUrl}/api/v1/operations/snapshot`)).status,
      200,
    );
    assert.equal(
      (await fetch(`${baseUrl}/api/v1/operations/snapshot`)).status,
      429,
    );

    const liveResponse = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "en",
        consentAcknowledged: true,
      }),
    });
    assert.equal(liveResponse.status, 201);
  });

  it("keeps dashboard-read and caller-session origins separated end to end", async () => {
    const dashboardOrigin = "http://localhost:3000";
    const separatedConfig: AgentApiConfig = {
      ...config,
      allowedOrigins: new Set([allowedOrigin]),
      operationsAllowedOrigins: new Set([dashboardOrigin]),
    };
    const baseUrl = await startServer(
      mockClient(),
      undefined,
      undefined,
      separatedConfig,
    );

    const dashboardRead = await fetch(
      `${baseUrl}/api/v1/operations/snapshot`,
      { headers: { Origin: dashboardOrigin } },
    );
    assert.equal(dashboardRead.status, 200);

    const dashboardLive = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: dashboardOrigin,
      },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "en",
        consentAcknowledged: true,
      }),
    });
    assert.equal(dashboardLive.status, 403);

    const callerOperations = await fetch(
      `${baseUrl}/api/v1/operations/snapshot`,
      { headers: { Origin: allowedOrigin } },
    );
    assert.equal(callerOperations.status, 403);

    const callerLive = await fetch(`${baseUrl}/api/live/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: allowedOrigin,
      },
      body: JSON.stringify({
        sdp: "offer-sdp",
        language: "en",
        consentAcknowledged: true,
      }),
    });
    assert.equal(callerLive.status, 201);
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
    assert.match(received?.backendInstructions ?? "", /find_facilities/);
    assert.match(received?.backendInstructions ?? "", /fictional Tulu dataset/);
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
