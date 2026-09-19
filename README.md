# AGI PRIME

<p align="center">
  <img src="assets/agi-prime-hero.png" alt="AGI PRIME — neural lattice and heart-core light" width="920" />
</p>

AGI PRIME is a modular AI platform with:
- a desktop runtime (`Electron` + `React`) for the full multi-panel cognitive system
- a mobile companion app (`Expo` + `React Native`) for AGI PRIME on phone

In plain terms: it is a multi-panel AI system with memory, reasoning, action tools, ethics checks, self-improvement loops, and now a trusted-source autonomous learning path inside SPARK.

This README explains what the project is, how it is organized, and how to run it.

## What This Project Is

- A desktop AI runtime (`Electron` + `React`) with a custom operating model for cognition.
- A mobile companion app (`AGIPrime-Mobile`) built with `Expo` and `React Native`.
- Not just a chat window: the app is split into modules for communication, memory, emotion, planning, action, safety, and evolution.
- **Heart-aware cognition**: the same emotion inference drives the renderer and Electron memory snapshots; vector recall can be re-ranked by current mood; system prompts carry a **HEART** attunement block so tone matches relational state (without pretending to “feel” like a human).
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

- `Nexus`: core chat interface, streaming output, and memory-aware responses (RAG ranked with **Heart**)
- `Memory`: memory browser/search (semantic search uses the same **Heart**-biased ranking as Nexus when you search)
- `Heart`: emotional and relationship/consciousness state (feeds context, memory recall, and LLM attunement)
- `Mind`: multi-agent arena — three specialist voices, a **debate moderator** pass (agreements / conflicts / open questions), then synthesizer + optional AGI blueprint JSON
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

- **Heart ↔ memory ↔ context**: shared `emotion-infer` in the renderer (`src/prime/emotion-infer.ts`) and Electron (`electron/lib/emotion-infer.js`) so persisted consciousness stays aligned with chat; `buildSystemAddendum` accepts `heartContext` via `heartSnapshotFromConsciousness()`; Forge, Sovereign, Spark autonomy, Nexus, and Mind arena all inject it.
- **Emotion-conditioned recall**: `searchMemories` can re-rank vector hits using stored memory `emotion` tags; Nexus and the Memory panel pass current Heart state.
- **Mind moderator UI**: after the three parallel agents finish, the main process runs a moderator pass and emits `arena:moderatorReady`; the Mind panel shows a **MODERATOR MAP** before synthesis, and the map can be stored as vector memory for later recall.
- **Autonomous web learning in SPARK**: SPARK can now convert curiosity questions into research queries, search trusted sources, verify factual quality, and merge extracted entities/relations into its world model.
- **Truth filtering pipeline**: new source-tiering, blocked-domain filtering, heuristic bias detection, and optional LLM verification reduce the chance of low-quality knowledge entering the system.
- **Mobile app workspace**: `AGIPrime-Mobile` adds an Expo-based companion app with environment-backed provider settings, animated UI primitives, and mobile-safe LLM access patterns.
- **GitHub Repo Knowledge Ingestor**: new end-to-end pipeline that discovers repos, runs 3-layer quality gates, distills codebase knowledge, deduplicates against vector memory, stores accepted insights, and can optionally commit/push memory updates.
- **Release packaging**: Windows (NSIS + portable), macOS per-arch DMG, Linux/Steam Deck AppImage + deb, with a dedicated icon set and GitHub Actions **Release** workflow.
- **Windows kernel-crash hotfix (1.1.1)**: slim `system:info` IPC (no soul/consciousness over the wire); Settings gear stays pinned in the sidebar.
- **Hands Settings unfreeze (1.1.2)**: 1.1.1 turned off GPU compositing on Windows and painted a white slab / locked the app when the Hands gear opened a blurred modal. GPU is back on; `--safe-mode` still disables it. Modals portal to `document.body` without `backdrop-filter`.
- **Release screen lockup (1.1.3)**: packaged builds no longer lazy-load each sidebar screen (a stalled chunk left a dark empty pane). Remaining `backdrop-filter` blurs are gone, Chromium window-occlusion is disabled on every OS, and a crashed renderer reloads instead of staying black.

## Core Engine Modules (`src/prime`)

- `emotion-infer.ts`: fast deterministic emotion inference from text (shared semantics with Electron; re-exported from `spark.ts` for compatibility)
- `context.ts`: shared system addendum (date, RAG, conscience, champion, SPARK snapshot, **HEART** block, NeuralCore, Oracle voice, etc.)
- `memory.ts`: vectorized memory, retrieval, RAG formatting, optional **Heart** re-ranking, `injectRAGContext` helper
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

## Release 1.1.3 — Windows, macOS, Steam Deck

Packaged desktop builds live in `release/` after you run the dist scripts (or download GitHub Actions artifacts from the **Release** workflow).

| Platform | Artifact | How to run |
| --- | --- | --- |
| **Windows** | `AGI-PRIME-1.1.3-Windows-Setup-x64.exe` | Installer with Start Menu + desktop shortcut. Portable: `AGI-PRIME-1.1.3-Windows-Portable-x64.exe`. |
| **macOS** | `AGI-PRIME-1.1.3-macOS-arm64.dmg` (Apple Silicon) or `…-x64.dmg` (Intel) | First open: right-click the app → **Open** (unsigned build). |
| **Steam Deck / Linux** | `AGI-PRIME-1.1.3-linux-x86_64.AppImage` | Desktop Mode: mark executable and double-click. Game Mode: add as a non-Steam game, or use `scripts/steamdeck-launch.sh`. Also ships a `.deb`. |

Local packaging:

```bash
npm run dist:win         # Windows NSIS + portable
npm run dist:mac         # macOS DMG + zip (run on macOS)
npm run dist:linux       # AppImage + deb
npm run dist:steamdeck   # AppImage only
```

CI: `.github/workflows/release.yml` builds all three OS families on version tags (`v1.1.3`) or **workflow_dispatch**.

Steam Deck notes:
- Uses compact chrome and performance mode by default (less background LLM chatter on the APU).
- Toggle **Compact Layout** in Settings if you want the full desktop density.
- Wrapper: `scripts/steamdeck-launch.sh /path/to/AGI-PRIME.AppImage`

## Build and Run

### Desktop

```bash
npm install
npm run dev            # Vite + Electron
# or
./LAUNCH.sh            # macOS / Linux
LAUNCH.bat             # Windows
```

```bash
npm run build          # renderer only
npm start              # Electron against dist/
npm run dist           # current-OS installer into release/
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
  runtime.ts
  store.ts
  types.ts
  components/
  prime/
electron/
  main.js
  preload.js
  platform.js
  icon.png
  lib/
    emotion-infer.js
  input-helper.ps1
build/
  icon.png
  icon.ico
  icon.icns
  icons/
assets/
  agi-prime-hero.png
scripts/
  steamdeck-launch.sh
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
