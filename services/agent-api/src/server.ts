import { createServer } from "node:http";
import OpenAI from "openai";

import { createApiHandler } from "./app.js";
import { ConfigurationError, loadConfig } from "./config.js";
import { ClinicLiveToolRuntime } from "./live/clinic-live-tool-runtime.js";
import { createOpenAILiveSessionClient } from "./live/openai-live-session-client.js";
import { ClinicToolExecutor } from "./tools/clinic-tool-executor.js";
import { DemoClinicStore } from "./tools/demo-clinic-store.js";

function clinicLocalDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

try {
  const config = loadConfig();
  const openAI = new OpenAI({ apiKey: config.openAIApiKey, maxRetries: 0 });
  const clinicStore = new DemoClinicStore();
  const toolRuntime = new ClinicLiveToolRuntime(
    openAI,
    new ClinicToolExecutor(clinicStore),
    ({ sessionId }) => ({
      sessionId,
      clinicId: "maralal-chc",
      clinicTimezone: "Africa/Nairobi",
      clinicLocalDate: clinicLocalDate(),
    }),
  );
  const liveSessionClient = createOpenAILiveSessionClient(
    config.openAIApiKey,
    openAI,
    toolRuntime,
  );
  const server = createServer(
    createApiHandler({
      config,
      liveSessionClient,
      dashboardStore: clinicStore,
      toolsEnabled: true,
    }),
  );

  server.listen(config.port, config.host, () => {
    console.info(`Tulu agent API listening on http://${config.host}:${config.port}`);
  });

  const close = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(error.message);
  } else {
    console.error("Tulu agent API failed to start.");
  }
  process.exitCode = 1;
}
