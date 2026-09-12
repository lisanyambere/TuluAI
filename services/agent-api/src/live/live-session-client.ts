import type { LiveSessionResponse, SupportedLanguage } from "@tulu/shared";

export interface CreateLiveSessionInput {
  sdp: string;
  language: SupportedLanguage;
  liveModel: "gpt-live-1";
  backendModel: "gpt-5.6-terra";
  liveInstructions: string;
  backendInstructions: string;
}

export interface LiveSessionClient {
  create(input: CreateLiveSessionInput): Promise<LiveSessionResponse>;
}
