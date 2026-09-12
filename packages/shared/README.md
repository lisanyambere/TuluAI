# Tulu shared contracts

Framework-neutral request validation and TypeScript contracts shared by the caller, facility dashboard, and agent API.

The voice contract covers the browser-to-server GPT-Live WebRTC handshake:

```ts
type LiveSessionRequest = {
  sdp: string;
  language: "en" | "sw";
  consentAcknowledged: true;
};
```

The successful response preserves OpenAI's Live session shape: a session ID and a WebRTC SDP answer. Runtime validators deliberately report field names, never submitted values.

`src/operations.ts` defines framework-neutral records for fictional facilities, service availability, inventory, verification status, and the three read-only query result envelopes. Operational records use explicit `synthetic: true`, `verifiedAt`, and `validUntil` fields so both the agent and dashboard can render uncertainty without inventing freshness.

Do not place secrets, server-only code, patient information, or browser-specific components in this package.
