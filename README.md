# Tulu

Tulu is a voice-led healthcare access project for communities where calling is more accessible than navigating a conventional application.

This repository is a pnpm monorepo so the public caller experience, protected facility dashboard, agent backend, and shared contracts can be developed and deployed independently.

## Repository structure

```text
apps/
  mobile/          Public caller-side web simulation
  main-dash/       Facility operations dashboard (reserved)
services/
  agent-api/       Server-side agent and tool orchestration (reserved)
packages/
  shared/          Shared schemas, types, and status definitions (reserved)
```

## Run the caller simulation

```bash
pnpm install
pnpm dev
```

Build every implemented workspace package with:

```bash
pnpm build
```

The current caller build is intentionally frontend-only. It does not place a real phone call, capture microphone audio, connect to OpenAI, or create a healthcare request.
