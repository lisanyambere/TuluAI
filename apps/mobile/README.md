# Tulu mobile voice demo

Public, responsive web experience that lets a caller reach the Tulu AI voice agent from a familiar phone interface.

The browser captures microphone audio only after the caller reviews the AI disclosure and explicitly continues. It sends a WebRTC offer to the trusted `agent-api`; no OpenAI credential is shipped to the browser.

## Commands

Run these from the repository root:

```bash
pnpm dev:mobile
pnpm build:mobile
pnpm preview:mobile
```

During local Vite development, `/api` requests are proxied to `http://127.0.0.1:8787`.

For a separately hosted mobile build, configure the public backend origin at build time:

```bash
VITE_AGENT_API_URL=https://api.example.com pnpm build:mobile
```

`VITE_AGENT_API_URL` must contain only the public `agent-api` origin. Never put `OPENAI_API_KEY` or any other secret in a `VITE_` variable.

For an independent deployment, use `apps/mobile` as the project root and `dist` as the build output directory.

This experience uses browser audio rather than the mobile phone network. It does not dial a PSTN number, provide medical advice, dispatch emergency help, or submit a real healthcare request.
