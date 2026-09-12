# Tulu agent API

Trusted Node.js/TypeScript backend for creating Tulu GPT-Live WebRTC sessions. The browser sends an SDP offer here; this server keeps the OpenAI project key private, constructs both prompts, creates the Live session, and returns the SDP answer. Prompts are behavioral guidance, not an authorization or secrecy boundary.

The first slice uses:

- `gpt-live-1` for full-duplex conversation
- Responses delegation to `gpt-5.6-terra`
- English (`en`) and Kiswahili (`sw`) prompt variants
- explicit `store: false` session configuration for this demo
- strict origin, JSON body, language, SDP, and consent validation
- a conservative in-memory rate limit because each session request is chargeable
- an explicit WebRTC data-channel allowlist that blocks direct backend-response and tool-result commands from the browser
- no facility tools or real health records yet

## Local setup

From the repository root, install workspace dependencies once. Then copy the environment template if `.env` does not already exist:

```bash
cp services/agent-api/.env.example services/agent-api/.env
```

Put the project-scoped service-account key only in `services/agent-api/.env`:

```dotenv
OPENAI_API_KEY=your-secret-key
```

Never prefix this variable with `VITE_`, send it to a browser, log it, or commit the `.env` file.

Start the API:

```bash
pnpm --filter @tulu/agent-api dev
```

It listens at `http://127.0.0.1:8787` by default. Check process health at `GET /health`.
On a container host, set `HOST=0.0.0.0` and set `WEB_ORIGINS` to the mobile site's exact HTTPS origin.

## Browser handshake contract

`POST /api/live/sessions` requires an allowed `Origin`, `Content-Type: application/json`, and this body:

```json
{
  "sdp": "the browser RTCPeerConnection offer",
  "language": "en",
  "consentAcknowledged": true
}
```

A successful response has status `201` and preserves the OpenAI GPT-Live result shape:

```json
{
  "session": { "id": "session-id" },
  "transport": { "type": "webrtc", "sdp": "answer-sdp" }
}
```

The mobile client applies `transport.sdp` as its remote WebRTC description, then waits for the `session.started` event before sending commands.

## Safety scope

The prompts describe Tulu as an AI demonstration healthcare-access coordinator, not a clinician or emergency service. They prohibit diagnosis, medical advice, prescriptions, dosage guidance, emergency assessment, dispatch claims, and invented facility data. Because this slice has no custom functions, it is also explicitly forbidden from claiming that it checked or changed any real system.

Later tool execution belongs in this service. Read operations must use timestamped source data; state-changing operations must be authorized, read back, explicitly confirmed, validated, idempotent, and recorded by application code rather than trusted to model instructions alone.

## Production notes

Origin checking is not user authentication. Before public deployment, add a short-lived authenticated session grant, authorization, global and per-principal quotas in a shared rate-limit store, HTTPS, audit-safe structured logs, trusted-proxy configuration for the selected host, session lifecycle controls, project spend limits/alerts, and an approved privacy/clinical-safety review. Move application-authored instruction and commentary events from the untrusted browser to a trusted sideband connection before enabling real tools. Use synthetic data until those controls and appropriate data-processing terms are in place.

Run checks after dependencies are installed:

```bash
pnpm --filter @tulu/shared build
pnpm --filter @tulu/agent-api typecheck
pnpm --filter @tulu/agent-api test
```
