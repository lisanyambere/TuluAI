import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBackendPrompt } from "./prompts/backend-prompt.js";
import { buildLivePrompt } from "./prompts/live-prompt.js";

describe("appointment prompts", () => {
  it("keeps the caller in the preselected Maralal clinic workflow", () => {
    const livePrompt = buildLivePrompt("en");
    const backendPrompt = buildBackendPrompt("en", true);

    for (const prompt of [livePrompt, backendPrompt]) {
      assert.match(prompt, /Maralal Community Health Centre/);
      assert.match(prompt, /Never ask .*city.*location/i);
      assert.match(prompt, /service.*date/i);
    }
    assert.match(livePrompt, /Ask only for whichever .* missing/i);
    assert.match(livePrompt, /clear yes or no before booking/i);
    assert.match(backendPrompt, /call get_service_availability immediately/i);
    assert.match(backendPrompt, /use prepare_booking/i);
    assert.match(backendPrompt, /call confirm_booking only after a clear yes/i);
  });
});