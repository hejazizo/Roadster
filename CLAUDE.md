# Roadster

Browser driving game: a Roadster-style car that can boost, hop and glide. The plan lives in `ROADMAP.md`.

## Stack

Vite · TypeScript · React · React Three Fiber (three.js) · drei · Rapier (`@react-three/rapier`) · Zustand

## Commands

- `npm run dev` — dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm run format` / `npm run format:check` — Prettier

## Folders (`src/`)

- `scene/` — world: ground, lights, level geometry
- `car/` — car physics and controls
- `camera/` — chase / debug cameras
- `ui/` — HTML overlay (HUD, menus)
- `state/` — Zustand stores
- `config/` — `tuning.ts` and other config

## Rules

- **Tuning lives in `src/config/tuning.ts`.** Speeds, forces, gravity, fuel and other gameplay/physics values go there, never hard-coded in components. Purely visual constants (colors, light intensity) may stay in the component.
- **One milestone per session.** Work on the milestone asked for; don't pull work forward. Park later ideas under _Notes / ideas_ in `ROADMAP.md`.
- **Every milestone ends playable**: `dev`, `build` and `lint` all work, and the work is committed. Tick the milestone in `ROADMAP.md` with a one-line note.
