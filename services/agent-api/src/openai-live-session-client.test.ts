import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOpenAILiveSessionClient,
  InvalidLiveSessionResponseError,
  type OpenAILiveSdk,
} from "./live/openai-live-session-client.js";

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

  it("registers delegated tools and attaches the trusted sideband after validation", async () => {
    let payload: Parameters<OpenAILiveSdk["live"]["create"]>[0] | undefined;
    const attachedSessionIds: string[] = [];
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
    const tools = [
      {
        type: "function" as const,
        name: "find_facilities",
        strict: true,
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    ];
    const client = createOpenAILiveSessionClient("not-a-real-key", sdk, {
      responsesTools: tools,
      onSessionCreated: (sessionId) => {
        attachedSessionIds.push(sessionId);
      },
    });

    await client.create({
      sdp: "offer-sdp",
      language: "en",
      liveModel: "gpt-live-1",
      backendModel: "gpt-5.6-terra",
      liveInstructions: "live instructions",
      backendInstructions: "backend instructions",
    });

    assert.deepEqual(
      payload?.session.delegation.responses.tools,
      tools,
    );
    assert.equal(
      payload?.session.delegation.responses.tool_choice,
      "auto",
    );
    assert.equal(
      payload?.session.delegation.responses.parallel_tool_calls,
      true,
    );
    assert.deepEqual(attachedSessionIds, ["sess_tools"]);
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

  it("does not return a tool-enabled session when trusted attachment fails", async () => {
    const sdk: OpenAILiveSdk = {
      live: {
        create: async () => ({
          session: { id: "sess_without_sideband" },
          transport: { type: "webrtc", sdp: "answer-sdp" },
        }),
      },
    };
    const client = createOpenAILiveSessionClient("not-a-real-key", sdk, {
      responsesTools: [
        {
          type: "function",
          name: "find_facilities",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
      onSessionCreated: async () => {
        throw new Error("sideband unavailable");
      },
    });

    await assert.rejects(
      client.create({
        sdp: "offer-sdp",
        language: "en",
        liveModel: "gpt-live-1",
        backendModel: "gpt-5.6-terra",
        liveInstructions: "live instructions",
        backendInstructions: "backend instructions",
      }),
      /sideband unavailable/,
    );
  });
});
