# Roadster

Browser driving game: a Roadster-style car that can boost, hop and glide. The plan lives in `ROADMAP.md`.

## Stack

Vite · TypeScript · React · React Three Fiber (three.js) · drei · Rapier (`@react-three/rapier`) · Zustand

## Commands

Docker (only Docker needed on the host):

- `make dev` — build the image and start the dev server on http://localhost:5173 (hot reload via bind mount)
- `make down` — stop it
- `make lint` / `make build` / `make format` — run the npm scripts in a container
- `make shell` — bash inside the container; `make clean` — remove image and volumes
- `make car-model` — rebuild `public/models/car.glb` from the source model (see `docs/car-model-spec.md`)
- `make sim` — headless handling sim (`scripts/sim-car.ts`): runs the car's own step code in Rapier and checks driving, drifts, jumps, ring reachability, the jets and air roll, and the half-loop (with and without fans, and the drop off its lip) for each assist mode on both levels (Test Track and Proving Ground); run it after changing car tuning or a level

The container keeps its own `node_modules`; `make dev` reinstalls when `package.json`/`package-lock.json` change.

Deploy: every push to `main` runs `.github/workflows/deploy.yml` (lint, format check, build) and publishes to GitHub Pages at https://hejazizo.github.io/Roadster/. The workflow sets `BASE_PATH=/Roadster/`; local builds use `/`. Reference files in `public/` through `import.meta.env.BASE_URL`, never with an absolute `/` path.

Local Node (alternative):

- `npm run dev` — dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm run model:car` — rebuild the car GLB
- `npm run sim:car` — handling sim (add assist modes and/or level ids to run only those, e.g. `npm run sim:car beginner proving`)

## Folders (`src/`)

- `scene/` — world: ground, lights, level geometry; levels are data (`levelData.ts` types, `testLevel.ts`, `provingGround.ts`, listed in `levels.ts`)
- `car/` — car physics and controls
- `camera/` — chase / debug cameras
- `vfx/` — visual effects: thruster flames, particles, tire marks, the speed blur effect
- `audio/` — synthesized sound and music (Web Audio API, no files); starts on the first click or key press
- `input/` — input layer: keyboard and gamepads mapped to actions
- `ui/` — HTML overlay (HUD, menus)
- `state/` — Zustand stores
- `config/` — `tuning.ts`, `bindings.ts` and other config

Outside `src/`: `public/models/` holds the runtime GLBs, `public/hdri/` the sky HDRI, `assets/` the source models they're built from, `scripts/` the build scripts and `docs/` specs such as `car-model-spec.md` (what a car GLB must contain) and `performance.md` (the FPS / draw-call baseline).

## Rules

- **Tuning lives in `src/config/tuning.ts`.** Speeds, forces, gravity, fuel and other gameplay/physics values go there, never hard-coded in components. Purely visual constants (colors, light intensity) may stay in the component.
- **Read tuning live.** The debug panel (`src/ui/TuningPanel.tsx`, toggle with the backquote key) edits `TUNING` in place, so read values when they're used or hold a section object; never copy a number out at module load.
- **The car model is visual only.** Physics comes from `TUNING.car`; a car GLB must follow `docs/car-model-spec.md`.
- **Read actions, not devices.** Game code reads input through `src/input/input.ts` (`axis`, `held`, `onPress`); only `src/input/` touches key events or the Gamepad API. Default bindings live in `src/config/bindings.ts`.
- **One milestone per session.** Work on the milestone asked for; don't pull work forward. Park later ideas under _Notes / ideas_ in `ROADMAP.md`.
- **Every milestone ends playable**: `dev`, `build` and `lint` all work, and the work is committed. Tick the milestone in `ROADMAP.md` with a one-line note.
