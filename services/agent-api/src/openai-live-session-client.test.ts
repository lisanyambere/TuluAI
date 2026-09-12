import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOpenAILiveSessionClient,
  InvalidLiveSessionResponseError,
  type OpenAILiveSdk,
} from "./live/openai-live-session-client.js";
import type { LiveToolRuntime } from "./live/live-tool-runtime.js";

describe("OpenAI Live SDK adapter", () => {
  it("uses the official GPT-Live WebRTC and Responses delegation payload", async () => {
    let payload: Parameters<OpenAILiveSdk["live"]["create"]>[0] | undefined;
    const sdk: OpenAILiveSdk = {
      live: {
        create: async (input) => {
          payload = input;
          return {
            session: { id: "sess_mock" },
            transport: { type: "webrtc", sdp: "answer-sdp" },
          };
        },
      },
    };
    const client = createOpenAILiveSessionClient("not-a-real-key", sdk);

    const result = await client.create({
      sdp: "offer-sdp",
      language: "en",
      liveModel: "gpt-live-1",
      backendModel: "gpt-5.6-terra",
      liveInstructions: "live instructions",
      backendInstructions: "backend instructions",
    });

    assert.deepEqual(payload, {
      session: {
        model: "gpt-live-1",
        store: false,
        instructions: "live instructions",
        client: {
          data_channel: {
            allowed_client_events: [
              "session.instructions.append",
              "session.commentary.append",
              "session.input_audio.mute",
              "session.input_audio.unmute",
              "session.close",
            ],
            allowed_server_events: [
              { type: "session.started" },
              { type: "session.instructions.appended" },
              { type: "session.commentary.appended" },
              { type: "session.input_audio.muted" },
              { type: "session.input_audio.unmuted" },
              { type: "session.input_transcript.delta" },
              { type: "session.output_transcript.delta" },
              { type: "session.closed" },
              { type: "error" },
              { type: "info" },
            ],
          },
        },
        delegation: {
          type: "responses",
          responses: {
            model: "gpt-5.6-terra",
            instructions: "backend instructions",
          },
        },
      },
      transport: { type: "webrtc", sdp: "offer-sdp" },
    });
    assert.deepEqual(result, {
      session: { id: "sess_mock" },
      transport: { type: "webrtc", sdp: "answer-sdp" },
    });
  });

  it("rejects malformed SDK responses", async () => {
    const sdk: OpenAILiveSdk = {
      live: { create: async () => ({ unexpected: true }) },
    };
    const client = createOpenAILiveSessionClient("not-a-real-key", sdk);

    await assert.rejects(
      client.create({
        sdp: "offer-sdp",
        language: "en",
        liveModel: "gpt-live-1",
        backendModel: "gpt-5.6-terra",
        liveInstructions: "live instructions",
        backendInstructions: "backend instructions",
      }),
      InvalidLiveSessionResponseError,
    );
  });

  it("only exposes tool schemas through an enabled server runtime", async () => {
    let payload: Parameters<OpenAILiveSdk["live"]["create"]>[0] | undefined;
    const attachments: Array<{ sessionId: string; language: string }> = [];
    const sdk: OpenAILiveSdk = {
      live: {
        create: async (input) => {
          payload = input;
          return {
            session: { id: "sess_tools" },
            transport: { type: "webrtc", sdp: "answer-sdp" },
          };
        },
      },
    };
    const toolRuntime: LiveToolRuntime = {
      enabled: true,
      definitions: [
        {
          type: "function",
          name: "test_tool",
          description: "A test tool",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
      attach: (input) => attachments.push(input),
    };
    const client = createOpenAILiveSessionClient(
      "not-a-real-key",
      sdk,
      toolRuntime,
    );

    await client.create({
      sdp: "offer-sdp",
      language: "sw",
      liveModel: "gpt-live-1",
      backendModel: "gpt-5.6-terra",
      liveInstructions: "live instructions",
      backendInstructions: "backend instructions",
    });

    assert.deepEqual(payload?.session.delegation.responses.tools, [
      toolRuntime.definitions[0],
    ]);
    assert.equal(
      payload?.session.delegation.responses.parallel_tool_calls,
      false,
    );
    assert.deepEqual(attachments, [
      { sessionId: "sess_tools", language: "sw" },
    ]);
  });
});
