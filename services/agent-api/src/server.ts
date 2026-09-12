import { createServer } from "node:http";

import { createApiHandler } from "./app.js";
import { ConfigurationError, loadConfig } from "./config.js";
import { createOpenAILiveSessionClient } from "./live/openai-live-session-client.js";
import { createOpenAISidebandConnectionFactory } from "./live/openai-sideband-connection.js";
import { LiveSidebandController } from "./live/sideband-controller.js";
import { createSyntheticOperationalRepository } from "./operations/repository.js";
import {
  createOperationalToolExecutor,
  operationalToolDefinitions,
} from "./operations/tools.js";

try {
  const config = loadConfig();
  const operationsRepository = createSyntheticOperationalRepository();
  const toolExecutor = createOperationalToolExecutor(operationsRepository);
  const sidebandController = new LiveSidebandController(
    createOpenAISidebandConnectionFactory(config.openAIApiKey),
    toolExecutor,
  );
  const liveSessionClient = createOpenAILiveSessionClient(
    config.openAIApiKey,
    undefined,
    {
      responsesTools: operationalToolDefinitions,
      onSessionCreated: (sessionId) => sidebandController.attach(sessionId),
    },
  );
  const server = createServer(
    createApiHandler({
      config,
      liveSessionClient,
      operationsRepository,
    }),
  );

  server.listen(config.port, config.host, () => {
    console.info(`Tulu agent API listening on http://${config.host}:${config.port}`);
  });

  const close = () => {
    sidebandController.closeAll();
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
