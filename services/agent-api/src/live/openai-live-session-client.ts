import {
  validateLiveSessionResponse,
  type LiveSessionResponse,
} from "@tulu/shared";
import OpenAI from "openai";

import type {
  CreateLiveSessionInput,
  LiveSessionClient,
} from "./live-session-client.js";

export interface OpenAILiveSdk {
  live: {
    create(input: {
      session: {
        model: "gpt-live-1";
        store: false;
        instructions: string;
        client: {
          data_channel: {
            allowed_client_events: Array<string>;
            allowed_server_events: Array<{ type: string }>;
          };
        };
        delegation: {
          type: "responses";
          responses: {
            model: "gpt-5.6-terra";
            instructions: string;
          };
        };
      };
      transport: {
        type: "webrtc";
        sdp: string;
      };
    }): Promise<unknown>;
  };
}

export class InvalidLiveSessionResponseError extends Error {
  constructor() {
    super("OpenAI returned an invalid Live session response");
    this.name = "InvalidLiveSessionResponseError";
  }
}

export function createOpenAILiveSessionClient(
  apiKey: string,
  sdk?: OpenAILiveSdk,
): LiveSessionClient {
  const openAI = sdk ? undefined : new OpenAI({ apiKey, maxRetries: 0 });
  const client: OpenAILiveSdk =
    sdk ??
    ({
      live: {
        create: (input) => openAI!.live.create(input),
      },
    } satisfies OpenAILiveSdk);

  return {
    async create(input: CreateLiveSessionInput): Promise<LiveSessionResponse> {
      const result = await client.live.create({
        session: {
          model: input.liveModel,
          store: false,
          instructions: input.liveInstructions,
          // The WebRTC browser is untrusted. Keep this allowlist synchronized with
          // the mobile UI and move instruction/commentary appends to a trusted
          // sideband connection before introducing real actions.
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
              model: input.backendModel,
              instructions: input.backendInstructions,
            },
          },
        },
        transport: {
          type: "webrtc",
          sdp: input.sdp,
        },
      });

      const validated = validateLiveSessionResponse(result);
      if (!validated.success) throw new InvalidLiveSessionResponseError();
      return validated.data;
    },
  };
}
