import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSyntheticOperationalRepository } from "./operations/repository.js";
import {
  createOperationalToolExecutor,
  operationalToolDefinitions,
} from "./operations/tools.js";

function parseOutput(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}

describe("operational tool executor", () => {
  const executor = createOperationalToolExecutor(
    createSyntheticOperationalRepository(),
  );

  it("keeps every strict tool schema closed and fully required", () => {
    for (const tool of operationalToolDefinitions) {
      assert.equal(tool.strict, true);
      assert.equal(tool.parameters.additionalProperties, false);
      assert.deepEqual(
        [...tool.parameters.required].toSorted(),
        Object.keys(tool.parameters.properties).toSorted(),
      );
    }
  });

  it("executes a registered read-only lookup and returns a JSON envelope", async () => {
    const result = await executor.execute(
      "find_facilities",
      JSON.stringify({ query: "north ridge", limit: 1 }),
    );
    const output = parseOutput(result.output) as {
      ok: boolean;
      data: {
        tool: string;
        count: number;
        synthetic: boolean;
        facilities: Array<{ id: string }>;
      };
    };

    assert.equal(result.ok, true);
    assert.equal(output.ok, true);
    assert.equal(output.data.tool, "find_facilities");
    assert.equal(output.data.count, 1);
    assert.equal(output.data.synthetic, true);
    assert.equal(
      output.data.facilities[0]?.id,
      "facility-north-ridge-demo",
    );
  });

  it("computes effective freshness with a trusted clock", async () => {
    const clockedExecutor = createOperationalToolExecutor(
      createSyntheticOperationalRepository(),
      { now: () => new Date("2026-09-18T00:00:00.000Z") },
    );
    const result = await clockedExecutor.execute(
      "find_facilities",
      JSON.stringify({ query: "north ridge", limit: 1 }),
    );
    const output = parseOutput(result.output) as {
      evaluatedAt: string;
      validity: Array<{ recordId: string; effectiveStatus: string }>;
    };

    assert.equal(output.evaluatedAt, "2026-09-18T00:00:00.000Z");
    assert.deepEqual(output.validity, [
      {
        recordId: "facility-north-ridge-demo",
        effectiveStatus: "stale",
        verifiedAt: "2026-09-10T08:30:00.000Z",
        validUntil: "2026-09-17T08:30:00.000Z",
      },
    ]);
  });

  it("returns safe invalid-argument errors for malformed JSON and invalid queries", async () => {
    const malformed = await executor.execute("check_inventory", "{not-json");
    assert.equal(malformed.ok, false);
    assert.deepEqual(parseOutput(malformed.output), {
      ok: false,
      error: {
        code: "invalid_arguments",
        message: "Tool arguments must be valid JSON.",
      },
    });

    const invalid = await executor.execute(
      "check_service_availability",
      JSON.stringify({ service: "", patientName: "must-not-be-accepted" }),
    );
    assert.equal(invalid.ok, false);
    assert.deepEqual(parseOutput(invalid.output), {
      ok: false,
      error: {
        code: "invalid_arguments",
        message: "The tool arguments were invalid.",
        issues: [
          "unexpected field: patientName",
          "service must be a non-empty string",
        ],
      },
    });
  });

  it("rejects unknown tool names without exposing implementation details", async () => {
    const result = await executor.execute(
      "delete_patient_records",
      JSON.stringify({ confirm: true }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(parseOutput(result.output), {
      ok: false,
      error: {
        code: "unsupported_tool",
        message: "The requested tool is not available.",
      },
    });
  });
});
