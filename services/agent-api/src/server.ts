import { createServer } from "node:http";

import { createApiHandler } from "./app.js";
import { ConfigurationError, loadConfig } from "./config.js";
import { createOpenAILiveSessionClient } from "./live/openai-live-session-client.js";

try {
  const config = loadConfig();
  const liveSessionClient = createOpenAILiveSessionClient(config.openAIApiKey);
  const server = createServer(createApiHandler({ config, liveSessionClient }));

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
