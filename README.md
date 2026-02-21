# AGI PRIME

AGI PRIME is an Electron desktop app that implements a modular "cognitive architecture" on top of LLMs.  
In plain terms: it is a multi-panel AI system with memory, reasoning, action tools, ethics checks, and self-improvement loops.

This README explains what the project is, how it is organized, and how to run it.

## What This Project Is

- A desktop AI runtime (`Electron` + `React`) with a custom operating model for cognition.
- Not just a chat window: the app is split into modules for communication, memory, emotion, planning, action, safety, and evolution.
- Works with multiple model providers (`Ollama`, `Anthropic`, `OpenAI`).
- Uses a centralized state store (`Zustand`) and a large main-process IPC/tooling layer in `electron/main.js`.

## High-Level Architecture

1. **UI panels** (`src/components`) collect input and visualize module state.
2. **Global store** (`src/store.ts`) orchestrates actions and keeps app state synchronized.
3. **IPC bridge** (`electron/preload.js`) exposes `window.api.*` methods to the renderer.
4. **Electron main process** (`electron/main.js`) handles model calls, filesystem ops, tool execution, consent, rollback, and persistence.
5. **Prime modules** (`src/prime`) implement memory, conscience, agent loops, routing, spark/autonomy, and evaluation systems.

## Main User Panels

- `Nexus`: core chat interface, streaming output, and memory-aware responses
- `Memory`: memory browser/search
- `Heart`: emotional and relationship/consciousness state
- `Mind`: multi-agent arena/debate mode
- `Hands`: ReAct-style action agent (observe/think/act/reflect)
- `Forge`: candidate generation + evaluation loop
- `Gauntlet`: benchmark/testing harness
- `Sovereign`: owner control/evolution controls and policy boundaries
- `Spark`: autonomous cognitive kernel visualization/control
- `Voice`: speech and spoken output
- `Creed`: immutable identity display
- `Settings`: model provider + runtime config

## Core Engine Modules (`src/prime`)

- `memory.ts`: vectorized memory and retrieval flow
- `conscience.ts`: ethical pre-checks and moral decision scoring
- `agent.ts`: action/cognition loop and tool-driven execution
- `router.ts`: fast/slow response routing
- `spark.ts`: autonomous multi-engine cognition runtime
- `gauntlet.ts`, `runtime.ts`, `sovereign.ts`: evaluation, improvement, and governance flows
- `ledger.ts`, `replay.ts`, `audit.ts`, `gate.ts`, `sandbox.ts`, `retention.ts`, `hardening.ts`: safety, integrity, auditability, and operational hardening

## Data Persistence

The app stores state under Electron user data:

- `app.getPath('userData')/agi-prime-data/`

Key files include:

- `memory.json`
- `settings.json`
- `vectors.json`
- `spark.json`
- `goals.json`
- `tool-registry.json`
- `rollback-registry.json`
- `run-ledgers/` (per-run immutable logs)
- `rollback-backups/` (backup artifacts for reversible operations)

## Tech Stack

- `React 18` + `TypeScript` + `Vite`
- `Electron`
- `Zustand`
- `Vitest` (unit tests for `src/prime/**`)

## Requirements

- Node.js `18+`
- npm
- Optional: Ollama for local models
- Optional: Anthropic/OpenAI keys for cloud models

## Environment Variables

`electron/main.js` loads `.env` from several locations (project root in dev, app-adjacent in packaged mode).

Common variables:

```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_API_KEY=...
OLLAMA_VISION_MODEL=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
ARC_API_KEY=...
# Optional legacy/fallback name used by some ARC docs/tooling:
ARC_AGI_API=...
```

## Local Development

```bash
npm install
npm run dev
```

This starts Vite and Electron together (`concurrently` + `wait-on`).

## Build and Run

```bash
npm run build      # builds renderer
npm start          # runs Electron app
npm run dist       # creates distributable (electron-builder)
```

## Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

Test config is in `vitest.config.ts`, and focuses coverage on `src/prime/**`.

## Project Layout

```text
src/
  App.tsx
  store.ts
  types.ts
  components/
  prime/
electron/
  main.js
  preload.js
  input-helper.ps1
```

## Short "What Is This?" Answer

AGI PRIME is a desktop AI platform that treats intelligence as a system of interacting modules (memory, ethics, planning, action, and improvement), not a single prompt/response loop.

---

Created by Aaron Grace.
