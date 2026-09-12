export interface AgentApiConfig {
  host: string;
  port: number;
  openAIApiKey: string;
  liveModel: "gpt-live-1";
  backendModel: "gpt-5.6-terra";
  allowedOrigins: ReadonlySet<string>;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  trustProxy: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  return value;
}

function readBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigurationError(`${name} must be true or false`);
}

function readExactModel<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  expected: T,
): T {
  const value = env[name]?.trim() ?? expected;
  if (value !== expected) {
    throw new ConfigurationError(`${name} must be ${expected} for this MVP`);
  }
  return expected;
}

function readOrigins(env: NodeJS.ProcessEnv): ReadonlySet<string> {
  const fallback = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ];
  const candidates = env.WEB_ORIGINS?.split(",") ?? fallback;
  const origins = new Set<string>();

  for (const candidate of candidates) {
    const raw = candidate.trim();
    if (!raw) continue;

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ConfigurationError("WEB_ORIGINS contains an invalid URL");
    }

    if (!["http:", "https:"].includes(url.protocol) || url.origin !== raw) {
      throw new ConfigurationError(
        "WEB_ORIGINS entries must be exact http(s) origins without paths",
      );
    }
    origins.add(url.origin);
  }

  if (origins.size === 0) {
    throw new ConfigurationError("WEB_ORIGINS must contain at least one origin");
  }
  return origins;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentApiConfig {
  const openAIApiKey = env.OPENAI_API_KEY?.trim();
  if (!openAIApiKey) {
    throw new ConfigurationError("OPENAI_API_KEY is required");
  }

  const port = readPositiveInteger(env, "PORT", 8787);
  if (port > 65_535) {
    throw new ConfigurationError("PORT must be at most 65535");
  }

  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port,
    openAIApiKey,
    liveModel: readExactModel(env, "OPENAI_LIVE_MODEL", "gpt-live-1"),
    backendModel: readExactModel(
      env,
      "OPENAI_BACKEND_MODEL",
      "gpt-5.6-terra",
    ),
    allowedOrigins: readOrigins(env),
    rateLimitWindowMs: readPositiveInteger(
      env,
      "RATE_LIMIT_WINDOW_MS",
      60_000,
    ),
    rateLimitMax: readPositiveInteger(env, "RATE_LIMIT_MAX", 6),
    trustProxy: readBoolean(env, "TRUST_PROXY", false),
  };
}
