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
- `make audio` — rebuild `public/audio/drivetrain/*.mp3`, the car's recorded drivetrain loops, from CC0 recordings (`scripts/build-audio.ts`, sources in `assets/audio/LICENSE.txt`)
- `make fleet-models` — rebuild `public/models/fleet/*.glb`, the Proving Ground's parked cars, built in code from `src/scene/fleetData.ts`
- `make sim` — headless handling sim (`scripts/sim-car.ts`): runs the car's own step code in Rapier and checks driving, drifts, jumps, ring reachability, the jets and air roll, the half-loop (with and without fans, and the drop off its lip), the fleet jump (kickflip, hits) and the reveal run's steps and scoring (`src/state/stuntRun.ts`) for each assist mode on the Proving Ground and on the Test Track (`testLevel.ts`, no longer in the game, kept as the sim's handling test ground); run it after changing car tuning or a level

The container keeps its own `node_modules`; `make dev` reinstalls when `package.json`/`package-lock.json` change.

Deploy: every push to `main` runs `.github/workflows/deploy.yml` (lint, format check, build) and publishes to GitHub Pages at https://hejazizo.github.io/Roadster/. The workflow sets `BASE_PATH=/Roadster/`; local builds use `/`. Reference files in `public/` through `import.meta.env.BASE_URL`, never with an absolute `/` path.

Local Node (alternative):

- `npm run dev` — dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm run model:car` — rebuild the car GLB
- `npm run model:fleet` — rebuild the fleet GLBs
- `npm run audio:build` — rebuild the drivetrain loops (needs `ffmpeg` on PATH)
- `npm run sim:car` — handling sim (add assist modes and/or level ids to run only those, e.g. `npm run sim:car beginner proving`)

## Folders (`src/`)

- `scene/` — world: ground, lights, level geometry; levels are data (`levelData.ts` types, `fleetData.ts` parked-car shapes, `provingGround.ts`, listed in `levels.ts`; `testLevel.ts` is only used by the sim)
  - `scene/art/` — level art drawn over the greybox colliders (night sky, ground and markings, floodlights, fence, scenery), from data in `artData.ts` (types) and `provingGroundArt.ts`; a level without `art` stays greybox under the day sky
- `car/` — car physics and controls
- `camera/` — chase / debug cameras, and `MenuFraming.tsx` (the main menu's view offset that lifts the car above the bottom bar)
- `vfx/` — visual effects: thruster flames, particles, tire marks, the speed blur effect
- `audio/` — sound and music (Web Audio API), starting on the first click or key press; all synthesized except the car's drivetrain (`drivetrain.ts`), which plays recorded EV loops from `public/audio/drivetrain/` fetched after that first gesture, with the synth motor as the fallback
- `input/` — input layer: keyboard and gamepads mapped to actions
- `ui/` — HTML overlay (HUD, menus); colours, fonts and base classes are tokens in `theme.css`, shared pieces (key caps, segmented pickers, choice cards, sheets, meters) in `components.tsx`, key and pad glyphs in `glyphs.tsx`, the round speed gauge in `Speedometer.tsx`. Menus use a virtual focus (`menuNav.ts`: d-pad / stick / arrows move a focus ring, nothing takes DOM focus) and `motion.ts` for count-ups; anything that moves has a fade-only version under `prefers-reduced-motion`
- `state/` — Zustand stores
- `config/` — `tuning.ts`, `bindings.ts` and other config

Outside `src/`: `public/models/` holds the runtime GLBs, `public/hdri/` the sky HDRI, `public/audio/` the drivetrain loops, `assets/` the source models they're built from (and the audio sources' licence; the raw recordings are downloaded, not committed), `scripts/` the build scripts and `docs/` specs such as `car-model-spec.md` (what a car GLB must contain) and `performance.md` (the FPS / draw-call baseline).

## Rules

- **Tuning lives in `src/config/tuning.ts`.** Speeds, forces, gravity, fuel and other gameplay/physics values go there, never hard-coded in components. Purely visual constants (colors, light intensity) may stay in the component.
- **Read tuning live.** The debug panel (`src/ui/TuningPanel.tsx`, toggle with the backquote key) edits `TUNING` in place, so read values when they're used or hold a section object; never copy a number out at module load.
- **The car model is visual only.** Physics comes from `TUNING.car`; a car GLB must follow `docs/car-model-spec.md`.
- **Read actions, not devices.** Game code reads input through `src/input/input.ts` (`axis`, `held`, `onPress`); only `src/input/` touches key events or the Gamepad API. Default bindings live in `src/config/bindings.ts`.
- **One milestone per session.** Work on the milestone asked for; don't pull work forward. Park later ideas under _Notes / ideas_ in `ROADMAP.md`.
- **Every milestone ends playable**: `dev`, `build` and `lint` all work, and the work is committed. Tick the milestone in `ROADMAP.md` with a one-line note.
