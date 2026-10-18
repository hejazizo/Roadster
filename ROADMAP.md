# Roadster Game — Roadmap

A browser driving game featuring a Roadster-style car that can boost, hop and glide.

**Stack:** Vite · TypeScript · React Three Fiber (three.js) · drei · Rapier (`@react-three/rapier`) · Zustand

## How to use this roadmap

- **One milestone = one session.** Start a session with: _"Read ROADMAP.md and do milestone N."_
- **Simple first, details last.** Phases 1–2 use placeholder shapes and simple logic. Visuals, the real car model, audio and polish wait until Phase 3, when the game is stable and fun.
- **Every milestone ends playable.** `npm run dev` works, nothing is half-wired, and the work is committed.
- **Tuning lives in one place.** Speeds, forces, gravity and fuel go in `src/config/tuning.ts`, never hard-coded in components.
- **Don't pull work forward.** If something belongs to a later milestone, write it under _Notes / ideas_ at the bottom instead of building it.
- Tick the checkbox and add a one-line note when a milestone is done.

## Progress

| #   | Milestone                      | Phase       | Status |
| --- | ------------------------------ | ----------- | ------ |
| 0   | Project scaffold               | 1 · Core    | ☑      |
| 1   | Drivable box car               | 1 · Core    | ☑      |
| 2   | Chase camera                   | 1 · Core    | ☑      |
| 3   | Boost, hop & glide             | 1 · Core    | ☑      |
| 4   | Basic HUD                      | 1 · Core    | ☑      |
| 5   | Greybox test world             | 1 · Core    | ☐      |
| 6   | Ring time-trial loop           | 2 · Game    | ☐      |
| 7   | Menus & saved best times       | 2 · Game    | ☐      |
| 8   | Input mapping & gamepad        | 2 · Game    | ☐      |
| 9   | Placeholder car model (GLB)    | 2 · Game    | ☐      |
| 10  | Stable v0.1 & deploy           | 2 · Game    | ☐      |
| 11  | Hero Roadster model            | 3 · Details | ☐      |
| 12  | Lighting & materials           | 3 · Details | ☐      |
| 13  | Thruster VFX & post-processing | 3 · Details | ☐      |
| 14  | Audio                          | 3 · Details | ☐      |
| 15  | Handling & flight polish       | 3 · Details | ☐      |
| 16  | Real level art                 | 3 · Details | ☐      |
| 17  | More levels & game modes       | 3 · Details | ☐      |
| 18  | Performance, mobile & settings | 3 · Details | ☐      |
| 19  | Release polish                 | 3 · Details | ☐      |

---

## Phase 1 — Core (keep it simple)

Goal: a box that drives, flies a little, and feels good. No art, no menus.

### M0 — Project scaffold

- Vite + React + TypeScript; install three, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, zustand.
- Full-screen `<Canvas>` with a flat ground plane, a directional light + ambient light, a sky color.
- `<Physics>` wrapper with a falling cube to prove physics works.
- Folder layout: `src/{scene,car,camera,ui,state,config}`.
- ESLint + Prettier, `npm run dev` / `build` / `lint` scripts.
- Short `CLAUDE.md` describing the stack, folders and the "tuning lives in config" rule.

**Done when:** a cube falls onto the ground in the browser, and `build` and `lint` pass.

✅ **Done:** React 19 / R3F 9 / drei 10 / Rapier 2 scaffold; cube falls and settles in `src/scene/FallingCube.tsx`; ESLint (flat config, since the Vite template now ships oxlint) + Prettier; gravity in `tuning.ts`.

### M1 — Drivable box car

- Box chassis + 4 cylinder wheels using Rapier's raycast vehicle controller.
- Keyboard: W/S = throttle/brake/reverse, A/D = steer, Space = handbrake (moved to E in M3), R = reset upright at spawn.
- Basic values in `tuning.ts` (engine force, brake force, steer angle, suspension).

**Done when:** you can drive around, turn, stop, reverse, and recover from flipping with R.

✅ **Done:** Rapier `DynamicRayCastVehicleController` in `src/car/Car.tsx` (RWD, car-local +Z forward, spawn yawed to face away from the camera); keyboard hook in `src/car/useCarControls.ts`; all values in `TUNING.car`; temporary fixed look-at camera in `src/camera/LookAtCar.tsx`.

### M2 — Chase camera

- Third-person camera behind and above the car, smoothly following position and heading (lerp/spring).
- Camera never clips below the ground.
- Toggle (C) between chase cam and a free orbit debug cam.

**Done when:** driving feels readable at both low and high speed.

✅ **Done:** `src/camera/ChaseCam.tsx` follows the car's interpolated chassis mesh with damped heading/position/look target, pulls back with speed, clamps above the ground and snaps on reset; `CameraRig.tsx` toggles drei `OrbitControls` with C; physics steps at `updatePriority={-1}` so the camera reads the current frame; sun + shadow box follow the car; values in `TUNING.camera`.

### M3 — Boost, hop & glide

The signature mechanic. Arcade physics, not real aerodynamics.

- Car state: `grounded` | `airborne` (raycast or wheel contact check).
- **Boost** (Shift): forward thrust, drains fuel.
- **Hop** (Space while grounded, or a separate key): upward impulse.
- **Glide** (hold hop key while airborne): reduced effective gravity plus light air control (pitch/yaw/roll), drains fuel.
- Fuel recharges while grounded.
- All values in `tuning.ts`; spend time tuning until it's fun.

**Done when:** you can hop, glide across a gap and land; fuel limits how long you stay airborne.

✅ **Done:** `src/car/abilities.ts` runs per physics step after `updateVehicle`: grounded = any wheel in contact; Shift boost (thrust impulse, capped at 45 m/s), Space hop (edge-triggered), hold Space airborne to glide (gravity scale 0.25, capped fall speed, horizontal velocity follows the heading); air control holds pitch/bank angles and auto-levels so the car can't be flipped; fuel drains on boost/glide and refills on the ground; handbrake moved to E; rear placeholder thruster glows while thrusting; values in `TUNING.car.{fuel,boost,hop,glide,airControl}`. Headless Rapier sim: plain hop ≈ 1.9 m / 1.2 s air, full-tank glide ≈ 4 s.

### M4 — Basic HUD

- Plain HTML overlay (not 3D): speed, fuel bar, grounded/airborne indicator.
- Shared game state in a Zustand store (`src/state`).
- Optional debug panel (leva) for live tuning values.

**Done when:** the HUD updates live and tuning can be adjusted without reloading.

✅ **Done:** `src/state/carStore.ts` mirrors speed/fuel/grounded/boosting/gliding once per frame from `Car.tsx`; `src/ui/Hud.tsx` shows ground speed (km/h), fuel bar and a Grounded/Airborne/Gliding pill, one selector per readout; leva panel `src/ui/TuningPanel.tsx` (hidden, toggle with \`) edits `TUNING` sections in place, with a _Log values_ button to copy tuned numbers back; suspension/tires are re-applied every step and ChaseCam reads tuning per frame so changes apply live; game keys ignore text fields.

### M5 — Greybox test world

- Replace the flat plane with a simple test level built from primitive shapes: ramps, raised platforms, a gap to jump, walls, a loop of road.
- Out-of-bounds / fall detection → respawn at last safe point.

**Done when:** every mechanic from M1–M3 has a place to be exercised, and falling off never softlocks the game.

---

## Phase 2 — A stable game

Goal: a complete, shippable loop (start → play → result → retry) that still looks like greybox.

### M6 — Ring time-trial loop

- Rings (torus + sensor collider) placed through the test world, some only reachable by gliding.
- Ordered checkpoints, start/finish, timer, lap complete.
- Simple game phases in the store: `ready` → `countdown` → `racing` → `finished`.
- Restart key.

**Done when:** you can complete a full run through all rings and get a final time.

### M7 — Menus & saved best times

- Main menu (Play), pause menu (Esc: Resume / Restart / Quit), results screen (time, best time, retry).
- Best time saved in `localStorage` (wrapped in try/catch).

**Done when:** the whole flow works without a page reload.

### M8 — Input mapping & gamepad

- An input layer that maps actions (`throttle`, `steer`, `boost`, `hop`, `reset`, `pause`) to devices, so game code never reads raw keys.
- Gamepad support via the Gamepad API (triggers for throttle/brake, stick for steer/air control).

**Done when:** a full run can be done on keyboard or gamepad with no code paths reading raw input.

### M9 — Placeholder car model (GLB)

- Set up the asset pipeline using a free low-poly car (CC0) or a quick Blender blockout.
- Load a `.glb` with `useGLTF`; visual wheels follow the physics wheels (spin + steer).
- Named empty nodes for thruster positions (used later for VFX).
- Document the expected GLB structure (node names, scale, forward axis) in `docs/car-model-spec.md` so the hero model in M11 is a drop-in swap.

**Done when:** the box is replaced by a model with spinning, steering wheels, and nothing in the physics changed.

### M10 — Stable v0.1 & deploy

- Bug bash: play through repeatedly, fix anything that breaks the loop.
- Performance baseline: check FPS on a laptop; note draw calls in the docs.
- Tidy code: remove dead experiments, make sure tuning is centralized.
- Deploy to Vercel / Netlify / GitHub Pages.

**Done when:** a public URL runs the full game loop at a smooth framerate. **Checkpoint: the game is stable; detail work starts after this.**

---

## Phase 3 — Details & polish

Each milestone here is independent enough to do in any order, apart from M11 → M12 → M13.

### M11 — Hero Roadster model

- Get the final model: model it in Blender from reference photos and published dimensions, commission an artist, or buy one **whose license allows use in a game** (avoid "editorial use only"). Don't use ripped or unlicensed files.
- For a commercial release, use an "inspired-by" design without Tesla names or logos unless licensed.
- Follow `docs/car-model-spec.md`: separate wheels, doors, thruster nozzles; correct scale and axis.
- Budget ~50k–150k triangles; compress with Draco/Meshopt (`gltf-transform`), KTX2 textures.

**Done when:** the hero car drops in with no code changes beyond the asset path.

### M12 — Lighting & materials

- HDRI environment map for reflections.
- Car paint using `MeshPhysicalMaterial` with clearcoat; glass, carbon fiber, emissive headlights and taillights.
- Shadows tuned (one shadow-casting light, tight shadow camera).
- Paint color choice (feeds into M17 unlockables).

**Done when:** the car looks premium in screenshots from the chase cam.

### M13 — Thruster VFX & post-processing

- Thruster flame and heat particles at the nozzle nodes; intensity tied to boost/glide.
- Dust on landing, tire marks when skidding.
- `@react-three/postprocessing`: bloom, light motion blur, vignette.
- Camera feel: FOV widens on boost, small shake on landing.

**Done when:** boosting and gliding feel powerful just from the visuals.

### M14 — Audio

- Electric motor whine with pitch tied to speed, thruster burst and loop, landing thump, ring pickup, UI clicks, music.
- Volume settings (master / music / SFX).
- Audio starts only after the first user interaction (browser autoplay rules).

**Done when:** every key action has a sound and there are no autoplay errors.

### M15 — Handling & flight polish

- Tire grip curves, drift / handbrake slides, weight transfer.
- Air control feel, auto-leveling assist, landing stability.
- Optional: assist modes (beginner / pro).

**Done when:** playtesters describe the car as fun to drive and fly, not floaty or twitchy.

### M16 — Real level art

- Replace greybox with a themed environment: terrain, road surfaces, props, skybox, distant scenery.
- Keep the greybox collision shapes where possible; art is a visual layer on top.

**Done when:** the first level looks finished and still plays the same.

### M17 — More levels & game modes

- 2–4 more levels.
- New modes, e.g. longest jump, free roam, ring challenge.
- Unlockables: paint colors, wheels, thruster colors.
- Level select menu.

**Done when:** there is enough content for ~30+ minutes of play.

### M18 — Performance, mobile & settings

- LODs for the car and props, instancing for repeated objects, texture size limits.
- Quality presets (low / medium / high) and an auto-detect default.
- Touch controls for mobile.
- Settings menu: graphics, audio, controls, camera.

**Done when:** the game runs smoothly on a mid-range laptop and a recent phone.

### M19 — Release polish

- Loading screen with progress, asset preloading.
- Accessibility: remappable keys, colorblind-safe UI, reduced camera-shake option.
- Error handling for WebGL failures; final bug bash.
- Final deploy, README with screenshots/GIF.

**Done when:** v1.0 is live.

---

## Notes / ideas

Park later ideas here instead of building them early.

- Multiplayer ghost races (share best-run replays)
- Leaderboards
- Day/night cycle and weather
- Bundle is ~3.4 MB (1.2 MB gzip), mostly Rapier's inlined WASM; Vite warns about chunk size. Look at code-splitting / lazy-loading physics in M10 or M18.
- Speed-sensitive steering (less steer angle at high speed) and some drag instead of a hard `maxSpeed` cutoff — M15.
- Chase cam ground clamp assumes flat ground at y = 0; switch to a downward raycast when M5 adds platforms and ramps.
- The chase cam can pass through walls between it and the car; add an obstruction raycast when M5 adds walls (or in M15).
- A reset tap shorter than one physics step (~16 ms) can be missed because controls are sampled per step; latch presses in the M8 input layer.
- Hop input buffering / coyote time (press Space just before landing or just after leaving a ledge) — M8 input layer or M15.
- There is no gap to glide over until M5; check gap widths and ramp heights against glide distance there (hop + full glide at 43 m/s covers ~245 m on flat ground).
- Air control currently works only while gliding; some (weaker) control while plainly airborne may feel better — M15. Glide also lowers gravity on the way up, so hop + hold flies higher (~8 m) than a plain hop; revisit if it feels floaty.
- leva adds ~0.2 MB to the bundle and ships in production builds; make the tuning panel dev-only or lazy-load it in M10.
- Console shows two deprecation warnings from libraries (`THREE.Clock` from R3F, Rapier init params); they should go away with library updates.
