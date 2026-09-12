import type {
  ClinicToolDefinition,
  SupportedLanguage,
} from "@tulu/shared";

export interface LiveToolAttachment {
  sessionId: string;
  language: SupportedLanguage;
}

export interface LiveToolRuntime {
  readonly enabled: boolean;
  readonly definitions: readonly ClinicToolDefinition[];
  attach(input: LiveToolAttachment): void;
}

export const disabledLiveToolRuntime: LiveToolRuntime = {
  enabled: false,
  definitions: [],
  attach: () => {},
};