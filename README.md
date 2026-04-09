# HFE Study

A cross-platform desktop application built with Electron, React, TypeScript, and Vite.

## Prerequisites

- Node.js (version pinned in [`app/.nvmrc`](./app/.nvmrc))
- npm

## Quick start

All app commands run from inside `app/`:

```bash
cd app
npm install
npm run dev
```

The dev server runs the renderer with hot module replacement and launches Electron pointing at it. Edit anything under `app/src/` and the app reloads automatically.

## Repo layout

```
HFEstudy/
├── CLAUDE.md          # Conventions for AI assistants
├── README.md          # This file
├── docs/              # Project documentation (study spec, midterm report, mockups)
├── build/             # electron-builder icon resources (icon.icns, icon.ico)
└── app/               # The Electron app — everything runnable lives here
    ├── src/
    │   ├── main/      # Electron main process (Node runtime)
    │   ├── preload/   # contextBridge between main and renderer
    │   └── renderer/  # React app (Chromium runtime)
    ├── People/        # Study assets (PFP/, videos/, audio/) — paired by first name
    ├── resources/     # Bundled defaults (config.default.json)
    ├── scripts/       # Tooling (generate-audio.mjs)
    ├── package.json
    ├── electron.vite.config.ts
    ├── electron-builder.yml
    └── tsconfig.json, postcss.config.cjs, tailwind.config.ts, ...
```

### Why this layout

- **`app/` is self-contained.** Everything needed to run, build, and package the Electron app lives under `app/`. The repo root holds only documentation and shared build resources.
- **Strict process separation inside the app.** The main process is Node-privileged; the renderer is a sandboxed browser. They never share modules directly.
- **Preload bridge.** The renderer cannot call Node directly. All cross-process communication goes through `contextBridge` in the preload script — the only secure pattern.
- **Path alias.** `@/*` resolves to the renderer source. Configured in both `app/tsconfig.json` and `app/electron.vite.config.ts`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check and bundle main, preload, renderer to `out/` |
| `npm run preview` | Run the built app without packaging |
| `npm run typecheck` | Run TypeScript across both Node and web tsconfigs |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run package` | Build + package an installer for the current OS |
| `npm run package:mac` | Build a macOS DMG (x64 + arm64) |
| `npm run package:win` | Build a Windows NSIS `.exe` installer |
| `npm run package:all` | Build DMG + EXE in one go (requires both toolchains) |

Build artifacts land in `release/<version>/`.

## Releases

Releases are produced by GitHub Actions. To cut a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers `.github/workflows/release.yml`, which:
1. Builds on `macos-latest` and `windows-latest` in parallel
2. Produces a DMG (universal: x64 + arm64) and an NSIS `.exe`
3. Uploads them to a draft GitHub Release

You can also trigger the workflow manually from the Actions tab (`workflow_dispatch`).

### Code signing

The current setup builds **unsigned** binaries. Users will see warnings on first launch. To sign:

- **macOS**: Apple Developer ID certificate + notarization. Set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` as GitHub secrets, then add `hardenedRuntime: true` and an entitlements plist back to `electron-builder.yml`.
- **Windows**: Code signing certificate (e.g., from DigiCert / SSL.com). Set `CSC_LINK` and `CSC_KEY_PASSWORD`.

These can be added later without changes to the app itself.

## Build resources

`build/` (at the repo root) holds platform icon assets used by `electron-builder`:
- `icon.icns` (macOS, 1024×1024)
- `icon.ico` (Windows, multi-resolution)

These are placeholders until real assets are added. `app/electron-builder.yml` references them via `../build/`.

## Running a study session

Launch the app, fill in the participant's first name, last name, and email on the welcome screen, then hand the laptop to the participant. The session runs top-to-bottom on its own:

1. **Intro** — 16 short videos, one per person. Some prompt for a memory phrase.
2. **Flashcards A** — 7 minutes of self-paced study (left arrow = still learning, right arrow = I know this).
3. **Snake** — 2-minute filler game.
4. **Flashcards B** — another 7-minute pass.
5. **Recall test** — 16 faces, 15 seconds each, type the first name.
6. **End** — data is finalized automatically. Use **Download results** to copy the participant folder to a USB drive or shared location, or **Quit** to close the app.

## Configuring the study

Knobs live in `config.json` inside the user-data directory:

- macOS: `~/Library/Application Support/HFE Study/config.json`
- Windows: `%APPDATA%\HFE Study\config.json`

The first launch copies `config.default.json` from the bundled resources. Edit `config.json` directly between sessions; the app reads it on launch.

People selection, flashcard block count/duration, and snake duration are no longer in `config.json` — they now come from the study JSON file the participant uploads on the welcome screen (built via the proctor's Experiment Builder).

| Key | What it does |
|---|---|
| `recallTimePerFaceSec` | Hard cap per face on the recall test (default 15) |
| `phraseMinChars` | Minimum length of memory phrase before Next is enabled (default 8) |
| `fuzzyMatchMaxEdits` | Levenshtein distance allowed when grading recall (default 2) |
| `mandatorySecondVideoPlay` | Require a replay before advancing in the intro phase |
| `assetsPath` | Where People assets live (relative to app or absolute) |
| `exportPath` | Where session folders are written (relative resolves under user-data) |

## Where data lands

By default, each session writes to `<userData>/exports/<participantId>/` with:

- `events.jsonl` — append-only event log written during the session
- `session.json` — the same events plus intake and mode-assignment metadata
- `recall.csv` — one row per recall answer (true name, typed, correct, edit distance, RT, mode)
- `study_log.csv` — one row per flashcard show/bucket (mode, session label, duration, bucket)
- `memory_phrases.csv` — one row per assigned person (firstName, mode, phrase)

`participantId` is `<unix-timestamp>-<random8hex>`. Set `exportPath` in `config.json` to redirect somewhere else (an absolute path is treated as-is).

## macOS Gatekeeper workaround

The unsigned/un-notarized DMG will be quarantined on machines other than the build machine. To clear:

```bash
xattr -cr "/Applications/HFE Study.app"
```

Re-run after each install.

## Asset requirements

People assets live under `app/People/` and are paired by first name:

```
app/People/
├── PFP/{Name}.png       — square headshot
├── videos/{Name}.mp4    — short intro video
└── audio/{Name}.m4a     — pre-rendered name pronunciation
```

A person is included only if all three files exist with matching stems. Names that are missing one of the three are silently dropped at scan time. Re-running `app/scripts/generate-audio.mjs` regenerates the audio files (e.g., when names change).

