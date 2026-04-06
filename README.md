# AGI PRIME

AGI PRIME is a modular AI platform with:
- a desktop runtime (`Electron` + `React`) for the full multi-panel cognitive system
- a mobile companion app (`Expo` + `React Native`) for AGI PRIME on phone

In plain terms: it is a multi-panel AI system with memory, reasoning, action tools, ethics checks, self-improvement loops, and now a trusted-source autonomous learning path inside SPARK.

This README explains what the project is, how it is organized, and how to run it.

## What This Project Is

- A desktop AI runtime (`Electron` + `React`) with a custom operating model for cognition.
- A mobile companion app (`AGIPrime-Mobile`) built with `Expo` and `React Native`.
- Not just a chat window: the app is split into modules for communication, memory, emotion, planning, action, safety, and evolution.
- Works with multiple model providers (`Ollama`, `Anthropic`, `OpenAI`).
- Uses a centralized state store (`Zustand`) and a large main-process IPC/tooling layer in `electron/main.js`.
- Includes SPARK autonomous web learning that can research curiosity questions against trusted science, government, university, and technical sources.

## High-Level Architecture

1. **UI panels** (`src/components`) collect input and visualize module state.
2. **Global store** (`src/store.ts`) orchestrates actions and keeps app state synchronized.
3. **IPC bridge** (`electron/preload.js`) exposes `window.api.*` methods to the renderer.
4. **Electron main process** (`electron/main.js`) handles model calls, filesystem ops, tool execution, consent, rollback, and persistence.
5. **Prime modules** (`src/prime`) implement memory, conscience, agent loops, routing, spark/autonomy, evaluation, and trusted-source learning systems.
6. **Mobile companion** (`AGIPrime-Mobile`) mirrors key AGI PRIME runtime concepts for Expo-based phone usage, including provider config and mobile-friendly LLM access.

## Main User Panels

- `Nexus`: core chat interface, streaming output, and memory-aware responses
- `Memory`: memory browser/search
- `Heart`: emotional and relationship/consciousness state
- `Mind`: multi-agent arena/debate mode
- `Hands`: ReAct-style action agent (observe/think/act/reflect)
- `Forge`: candidate generation + evaluation loop
- `Gauntlet`: benchmark/testing harness
- `Sovereign`: owner control/evolution controls and policy boundaries
- `Spark`: autonomous cognitive kernel visualization/control, including autonomous web learning
- `Repo`: GitHub repo knowledge ingestor with multi-gate quality filtering
- `Voice`: speech and spoken output
- `Creed`: immutable identity display
- `Settings`: model provider + runtime config

## Recent Additions

- **Autonomous web learning in SPARK**: SPARK can now convert curiosity questions into research queries, search trusted sources, verify factual quality, and merge extracted entities/relations into its world model.
- **Truth filtering pipeline**: new source-tiering, blocked-domain filtering, heuristic bias detection, and optional LLM verification reduce the chance of low-quality knowledge entering the system.
- **Mobile app workspace**: `AGIPrime-Mobile` adds an Expo-based companion app with environment-backed provider settings, animated UI primitives, and mobile-safe LLM access patterns.
- **GitHub Repo Knowledge Ingestor**: new end-to-end pipeline that discovers repos, runs 3-layer quality gates, distills codebase knowledge, deduplicates against vector memory, stores accepted insights, and can optionally commit/push memory updates.

## Core Engine Modules (`src/prime`)

- `memory.ts`: vectorized memory and retrieval flow
- `conscience.ts`: ethical pre-checks and moral decision scoring
- `agent.ts`: action/cognition loop and tool-driven execution
- `router.ts`: fast/slow response routing
- `spark.ts`: autonomous multi-engine cognition runtime
- `autonomous-learner.ts`: curiosity-to-research pipeline for trusted-source web learning
- `fact-verifier.ts`: heuristic + LLM content verification for autonomous learning
- `knowledge-sources.ts`: trusted domain registry, blocked domains, and source tier scoring
- `repo-ingestor.ts`: orchestrates discover -> quality gate -> extract -> dedupe -> store -> export/git publish
- `repo-quality-gate.ts`: metadata + structural + LLM quality gates for candidate repositories
- `repo-knowledge-extractor.ts`: distilled architecture/API/technique/tooling extraction
- `repo-registry.ts`: curated AGI topics/seeds and source blocklist policy
- `gauntlet.ts`, `runtime.ts`, `sovereign.ts`: evaluation, improvement, and governance flows
- `ledger.ts`, `replay.ts`, `audit.ts`, `gate.ts`, `sandbox.ts`, `retention.ts`, `hardening.ts`: safety, integrity, auditability, and operational hardening

## GitHub Repo Knowledge Ingestor

The `Repo` panel is a standalone intelligence-ingestion workflow focused on high-signal repositories.

- Discovery: topic-based GitHub search plus curated seed repos
- Quality gating: metadata, structure, and LLM code review checks
- Knowledge output: distilled understanding (not raw code dumps) stored as semantic memories
- Deduplication: similarity-based suppression to avoid duplicate memory entries
- Persistence: optional memory export and optional `git add/commit/push` for `Memory/latest.json`

Core files:

- `src/components/RepoIngestorPanel.tsx`
- `src/store/slices/repo-ingestor.ts`
- `src/prime/repo-ingestor.ts`
- `src/prime/repo-quality-gate.ts`
- `src/prime/repo-knowledge-extractor.ts`
- `src/prime/repo-registry.ts`
- `electron/main.js` (GitHub IPC handlers)
- `electron/preload.js` (renderer bridge for `window.api.github`)

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
- `Expo` + `React Native`
- `Zustand`
- `Vitest` (unit tests for `src/prime/**`)

## Requirements

- Node.js `18+`
- npm
- Optional: Ollama for local models
- Optional: Anthropic/OpenAI keys for cloud models
- Optional: Expo Go / Android emulator / iOS simulator for mobile development

## Environment Variables

The desktop runtime loads `.env` from several locations (project root in dev, app-adjacent in packaged mode).

`AGIPrime-Mobile/app.config.js` also reads from `.env`, so the mobile app can share the same provider settings without hardcoding secrets.

Common variables:

```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_API_KEY=...
OLLAMA_VISION_MODEL=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
ARC_API_KEY=...
GITHUB_TOKEN=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=...
SOUNDPRIME_URL=http://127.0.0.1:8080
# Optional legacy/fallback name used by some ARC docs/tooling:
ARC_AGI_API=...
```

## Local Development

### Desktop

```bash
npm install
npm run dev
```

This starts Vite and Electron together (`concurrently` + `wait-on`).

### Mobile

```bash
cd AGIPrime-Mobile
npm install
npm start
```

You can then open the Expo project in Expo Go, an emulator, or a simulator.

If you plan to use EAS commands, keep your Expo token in `AGIPrime-Mobile/.expo-token`. The repo includes `AGIPrime-Mobile/.expo-token.example` as a placeholder template only.

## Build and Run

### Desktop

```bash
npm run build      # builds renderer
npm start          # runs Electron app
npm run dist       # creates distributable (electron-builder)
```

### Mobile

```bash
cd AGIPrime-Mobile
npm run android
npm run ios
npm run web
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
AGIPrime-Mobile/
  app/
  src/
  assets/
  app.config.js
```

## Short "What Is This?" Answer

AGI PRIME is an AI platform that treats intelligence as a system of interacting modules (memory, ethics, planning, action, learning, and improvement), not a single prompt/response loop.

---

Created by Aaron Grace.
