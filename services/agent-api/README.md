# Tulu agent API

Trusted Node.js/TypeScript backend for Tulu GPT-Live WebRTC sessions and operational lookups. The browser sends an SDP offer here; this server keeps the OpenAI project key private, constructs both prompts, creates the Live session, attaches the privileged sideband, and returns the SDP answer. Prompts are behavioral guidance, not an authorization or secrecy boundary.

The first slice uses:

- `gpt-live-1` for full-duplex conversation
- Responses delegation to `gpt-5.6-terra`
- server-owned tool execution over an authenticated OpenAI Live sideband WebSocket
- validated `find_facilities`, `check_service_availability`, and `check_inventory` functions
- immutable, explicitly synthetic facility/service/inventory records
- a separate read-only `/api/v1/operations/*` surface for the dashboard
- English (`en`) and Kiswahili (`sw`) prompt variants
- explicit `store: false` session configuration for this demo
- strict origin, JSON body, language, SDP, and consent validation
- a conservative in-memory rate limit because each session request is chargeable
- an explicit WebRTC data-channel allowlist that blocks direct backend-response and tool-result commands from the browser
- no real facility integration, state-changing tool, patient record, or persistence

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
On a container host, set `HOST=0.0.0.0`, set `WEB_ORIGINS` to the mobile site's exact HTTPS origin, and set `OPERATIONS_WEB_ORIGINS` to the dashboard's exact HTTPS origin. These lists are intentionally separate so a dashboard origin does not automatically receive access to chargeable session creation.

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

## Trusted tool flow

The session registers three flat Responses function tools with `tool_choice: "auto"` and parallel read support. Immediately after OpenAI returns a validated session ID, the server attaches a second connection with `SidebandWS` and waits up to eight seconds for it to open before returning the SDP answer. Attachment failure fails call setup rather than leaving a tool-enabled conversation without an executor. Audio stays on the browser's WebRTC connection; nested `response.event` tool calls arrive on the server connection.

The controller collects completed `function_call` items from `response.output_item.done`, waits for `response.completed`, validates and executes every call, sends one `response.item.create` function result for each `call_id`, and then sends exactly one `response.create`. Calls are deduplicated and bounded. Successful outputs include a trusted evaluation time and effective freshness for every returned record. Unknown tools, malformed JSON, invalid arguments, and unexpected executor failures become safe structured tool errors rather than exceptions or leaked internals.

The browser's allowed-event list excludes `response.event`, `response.item.create`, and `response.create`, making this service the sole tool owner.

## Synthetic operations HTTP API

The dashboard can begin integration against these versioned read-only routes:

| Route | Query |
| --- | --- |
| `GET /api/v1/operations/snapshot` | None; returns all small fixture collections |
| `GET /api/v1/operations/facilities` | Optional `query` and `limit` (1–20) |
| `GET /api/v1/operations/service-availability` | Required `service`; optional `facilityId` and `location` |
| `GET /api/v1/operations/inventory` | Required `item`; optional `facilityId` and `location` |

Browser calls require an origin in `OPERATIONS_WEB_ORIGINS`; server-to-server requests without an `Origin` are accepted. The endpoint has its own `OPERATIONS_RATE_LIMIT_*` bucket. Every successful response and record is labelled synthetic and carries fixed verification metadata. Unexpected or duplicate query parameters are rejected.

## Safety scope

The prompts describe Tulu as an AI demonstration healthcare-access coordinator, not a clinician or emergency service. They prohibit diagnosis, medical advice, prescriptions, dosage guidance, emergency assessment, dispatch claims, and invented facility data. Tool-derived claims must be explicitly called fictional synthetic demo information and must preserve stale or unknown status. No tool can contact staff or change a system.

Future state-changing operations must remain in this service and must be authorized, read back, explicitly confirmed, validated, idempotent, and recorded by application code rather than trusted to model instructions alone.

## Production notes

Origin checking is not user authentication. Before public deployment, add a short-lived authenticated session grant, authorization, global and per-principal quotas in a shared rate-limit store, HTTPS, audit-safe structured logs, trusted-proxy configuration for the selected host, session lifecycle controls, project spend limits/alerts, and an approved privacy/clinical-safety review. Privileged tool events already use the sideband, but application-authored instruction/commentary events should also move off the untrusted browser. Use synthetic data until those controls and appropriate data-processing terms are in place.

Run checks after dependencies are installed:

```bash
pnpm --filter @tulu/shared build
pnpm --filter @tulu/agent-api typecheck
pnpm --filter @tulu/agent-api test
```
