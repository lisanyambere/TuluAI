import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConfigurationError, loadConfig } from "./config.js";

describe("agent API configuration", () => {
  it("keeps dashboard-read origins and limits separate from Live creation", () => {
    const config = loadConfig({ OPENAI_API_KEY: "test-only-key" });

    assert.equal(config.allowedOrigins.has("http://localhost:3000"), false);
    assert.equal(
      config.operationsAllowedOrigins.has("http://localhost:3000"),
      true,
    );
    assert.equal(
      config.operationsAllowedOrigins.has("http://localhost:5173"),
      false,
    );
    assert.equal(config.rateLimitMax, 6);
    assert.equal(config.operationsRateLimitMax, 120);
  });

  it("loads exact custom origin lists without broadening either capability", () => {
    const config = loadConfig({
      OPENAI_API_KEY: "test-only-key",
      WEB_ORIGINS: "https://call.example",
      OPERATIONS_WEB_ORIGINS: "https://dashboard.example",
    });

    assert.deepEqual([...config.allowedOrigins], ["https://call.example"]);
    assert.deepEqual([...config.operationsAllowedOrigins], [
      "https://dashboard.example",
    ]);
  });

  it("rejects origins containing paths", () => {
    assert.throws(
      () =>
        loadConfig({
          OPENAI_API_KEY: "test-only-key",
          OPERATIONS_WEB_ORIGINS: "https://dashboard.example/path",
        }),
      ConfigurationError,
    );
  });
});
