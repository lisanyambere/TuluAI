# Tulu facility dashboard

Next.js facility-side application for Tulu facility staff.

The dashboard lets facility staff review incoming requests, inspect current facility information, and prototype human follow-up. Authentication is intentionally disabled during this workflow build and will be wired with Auth0 later. OpenAI credentials and privileged agent logic remain in the Agent API; they must never be added to this application.

## Current integration boundary

The dashboard now loads its initial facility profile from the Agent API's read-only `GET /api/v1/operations/snapshot` endpoint. That server-side request uses the same immutable fictional facility and service records as the voice agent's tools. If the API is unavailable or returns an unexpected payload, the dashboard fails safely to an aligned, visibly labelled local fixture.

This is a deliberately narrow first connection:

- The facility profile is synthetic and read-only at the API boundary.
- The request queue is still seeded from local demo records.
- Status, assignment, note, and facility-form changes live only in browser memory.
- A voice call does not create a dashboard request yet.
- Auth0, persistent case storage, authenticated staff writes, and real facility sources remain future work.

## Local setup

Run the Agent API and dashboard together from the repository root:

```bash
pnpm install
pnpm dev
```

The caller opens at `http://localhost:5173`, the dashboard at `http://localhost:3000`, and the Agent API at `http://127.0.0.1:8787`. To work on only the dashboard and API, run `pnpm dev:agent` and `pnpm dev:dash` in separate terminals.

`AGENT_API_URL` is server-only and defaults to `http://127.0.0.1:8787`. Set it in `apps/main-dash/.env.local` or in the hosting platform when the API is deployed elsewhere:

```dotenv
AGENT_API_URL=https://api.example.org
```

Do not prefix it with `NEXT_PUBLIC_`; the current bootstrap is a server-to-server request. Auth0 placeholders are documented in `.env.example` for the later authentication step. Credentials must never be committed.

`apps/main-dash` can be configured as its own hosting project and deployment root. The hosting service must be able to reach the configured Agent API URL.
