# Tulu facility dashboard

Next.js facility-side application for Tulu facility staff.

The dashboard lets facility staff review incoming requests, confirm current facility information, and coordinate human follow-up. Authentication is intentionally disabled during the initial workflow build and will be wired with Auth0 later. The dashboard should consume the agent API rather than contain agent credentials or privileged business logic in the browser.

## Local setup

The current demo does not require environment variables or an Auth0 tenant. Run the dashboard from the repository root:

```bash
pnpm install
pnpm dev:dash
```

The dashboard currently uses a synthetic demo staff session and local request/facility data. Auth0 setup is documented in `.env.example` for the later integration step; credentials must never be committed.

The upstream `services/agent-api` currently provides the GPT-Live WebRTC session foundation only. It does not yet expose facility lookup, inventory, request persistence, or staff actions, so the dashboard keeps those workflows behind a local data provider until those contracts exist.

When implemented, `apps/main-dash` can be configured as its own hosting project and deployment root.
