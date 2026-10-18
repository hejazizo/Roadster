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
| 5   | Greybox test world             | 1 · Core    | ☑      |
| 6   | Ring time-trial loop           | 2 · Game    | ☑      |
| 7   | Menus & saved best times       | 2 · Game    | ☑      |
| 8   | Input mapping & gamepad        | 2 · Game    | ☑      |
| 9   | Placeholder car model (GLB)    | 2 · Game    | ☑      |
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

✅ **Done:** layout as data in `src/scene/testLevel.ts`, rendered by `src/scene/Level.tsx` (box slabs/platforms/walls, convex-hull wedge ramps, drei grid, visual-only circuit road): main island with kicker field, hop barriers, walled chicane alley, 2/4/7 m platform tower with a raised 8 m gap, and an L-shaped north island across a 20 m jump gap (kickers both ways) and an 80 m glide gap. `src/car/respawn.ts` records the last safe pose (all wheels down, upright, level ground 4 m around) and both falls below `world.killY` and R return there (spawn until one exists). Chase cam now raycasts for its ground clamp and pulls in in front of walls. Headless Rapier sim: kicker ≈ 34 m air, hop at 30 m/s clears 20 m, boost + hop without glide falls short of 80 m, hop + glide ≈ 123 m.

---

## Phase 2 — A stable game

Goal: a complete, shippable loop (start → play → result → retry) that still looks like greybox.

### M6 — Ring time-trial loop

- Rings (torus + sensor collider) placed through the test world, some only reachable by gliding.
- Ordered checkpoints, start/finish, timer, lap complete.
- Simple game phases in the store: `ready` → `countdown` → `racing` → `finished`.
- Restart key.

**Done when:** you can complete a full run through all rings and get a final time.

✅ **Done:** 7 rings + a start/finish arch as data in `TEST_LEVEL.rings`, rendered by `src/scene/Race.tsx` (visual-only torus + cylinder sensor; next ring glows gold, passed ones hide); `src/state/raceStore.ts` runs `ready → countdown → racing → finished` on physics time, counting only the next ring; Enter starts/restarts (car back to spawn, safe point cleared), the car is held until GO; `src/ui/RaceHud.tsx` shows timer, ring count and phase messages. Wheel, camera and respawn raycasts now skip sensors. Headless Rapier sim: every ring reachable; the void ring (7 m up, 40 m out) is hit by every hop + glide from 20–45 m/s and missed by every hop without gliding, and boosting on the run-up can leave too little fuel to cross.

### M7 — Menus & saved best times

- Main menu (Play), pause menu (Esc: Resume / Restart / Quit), results screen (time, best time, retry).
- Best time saved in `localStorage` (wrapped in try/catch).

**Done when:** the whole flow works without a page reload.

✅ **Done:** `src/ui/Menus.tsx` shows a main menu (best time, Play, controls), a pause menu (Resume / Restart / Quit) and a results screen (time, best or "New best!", Retry / Menu); keys Enter = play/restart, Esc = pause/resume (menu from results), Q = quit, and the game pauses itself on window blur or tab hide; `raceStore` gains a `menu` phase, `paused`, `quit()` and the best time, and pausing sets `<Physics paused>` so the car, clock and rings all freeze; the car coasts to a stop behind the results screen; best time per level (`Level.id`) in `localStorage` via `src/state/bestTimes.ts` (try/catch, junk values ignored). Checked in headless Chrome: full loop without reload, paused clock and car frozen, best saved across reloads, blocked/garbage storage handled.

### M8 — Input mapping & gamepad

- An input layer that maps actions (`throttle`, `steer`, `boost`, `hop`, `reset`, `pause`) to devices, so game code never reads raw keys.
- Gamepad support via the Gamepad API (triggers for throttle/brake, stick for steer/air control).

**Done when:** a full run can be done on keyboard or gamepad with no code paths reading raw input.

✅ **Done:** `src/input/input.ts` maps keyboard and every connected standard-mapping gamepad to the actions in `src/config/bindings.ts` (`axis` / `held` / `onPress`, gamepads polled on their own animation-frame loop so menus work while physics is paused); pad layout RT/LT throttle and brake (analog), left stick steer and air pitch, A hop/glide, B boost, X handbrake, Y reset, Menu pause, View restart, A/B confirm/back on menus; the car, menus, camera toggle and tuning panel read only actions, the car latches hop/reset presses per physics step and drains them in menus and the countdown; throttle, steer and air control are analog; menu hints and the controls list follow the last-used device; unplugging a pad pauses the run; deadzones in `TUNING.input`. Checked in headless Chrome with a scripted gamepad: every action on both devices, sub-step R tap, partial trigger, deadzone, no hop carried from the menu A press, unplug pause.

### M9 — Placeholder car model (GLB)

- Set up the asset pipeline using a free low-poly car (CC0) or a quick Blender blockout.
- Load a `.glb` with `useGLTF`; visual wheels follow the physics wheels (spin + steer).
- Named empty nodes for thruster positions (used later for VFX).
- Document the expected GLB structure (node names, scale, forward axis) in `docs/car-model-spec.md` so the hero model in M11 is a drop-in swap.

**Done when:** the box is replaced by a model with spinning, steering wheels, and nothing in the physics changed.

✅ **Done:** Kenney Car Kit `race-future` (CC0) source in `assets/car-kit/`; `scripts/build-car-model.ts` (`npm run model:car`, gltf-transform) converts it to `public/models/car.glb` from the current tuning: renamed nodes, body scaled to the physics wheelbase and ground line, wheels centred and resized onto the physics hubs, `thruster_left`/`thruster_right` empties, texture embedded. `src/car/CarModel.tsx` loads it with `useGLTF` (path in `src/config/assets.ts`), splits off the `wheel_*` nodes into the existing steer/spin groups and draws the thruster glow at each `thruster_*` node, with dev console warnings for missing or misplaced wheels; the camera target is now a group outside the model's Suspense. Spec in `docs/car-model-spec.md`. Collider, tuning and physics code untouched. Checked in headless Chrome: front wheels steer, all wheels spin and follow the suspension, glow on boost, no spec warnings, and a scripted 3 s drive matches HEAD within run-to-run noise.

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
- Bundle is ~3.7 MB (1.27 MB gzip; GLTFLoader added ~70 kB in M9), mostly Rapier's inlined WASM; Vite warns about chunk size. Look at code-splitting / lazy-loading physics in M10 or M18.
- Speed-sensitive steering (less steer angle at high speed) and some drag instead of a hard `maxSpeed` cutoff — M15.
- Hop input buffering / coyote time (press Space just before landing or just after leaving a ledge) — M15. Hop presses are latched for one physics step now; a buffer would keep them a little longer.
- Air control currently works only while gliding; some (weaker) control while plainly airborne may feel better — M15. Glide also lowers gravity on the way up, so hop + hold flies higher (~8 m) than a plain hop; revisit if it feels floaty.
- leva adds ~0.2 MB to the bundle and ships in production builds; make the tuning panel dev-only or lazy-load it in M10.
- Console shows two deprecation warnings from libraries (`THREE.Clock` from R3F, Rapier init params); they should go away with library updates.
- Respawn faces the way the car was heading, so after driving off an edge it faces the drop 4 m back; holding W drives straight off again. Consider facing away from the nearest edge, or a short input lockout — M15.
- The circuit road is visual only; give it a collider/surface type if road vs. grass grip matters (M15/M16).
- The chase cam's wall pull-in is an instant clamp, so it can pop when a wall passes between car and camera; damp the release (not the pull-in) in M15.
- Ring course: a direction arrow or minimap pointing at the next ring, per-ring split times, and multi-lap races (M17 modes).
- The finish arch sits right ahead of spawn, so the last leg loops back around to pass through it; consider moving spawn or the arch when the level gets real art (M16).
- Gamepad: d-pad / stick focus navigation in menus (needed once menus have more than a few buttons), rumble on landing and boost (M13/M15), and a fallback for pads without the "standard" mapping (indices are assumed standard). Key remapping UI is M19; bindings are already data.
- A press latched while the pause menu is up (e.g. Y) still fires on resume; clear the car's latches on pause if it ever matters.
- Holding W and S together now cancels to the idle brake (before, W won); same for both triggers.
- The placeholder body is longer than the 4 m chassis collider (4.55 m, nose ~0.57 m ahead of it), so the nose can dip into walls on a head-on hit, and its arches are modelled for bigger wheels than the physics' 0.4 m. Fit the collider (and maybe wheel size) to the hero model in M11, as a tuning change.
- The thruster glow is a flat disc per `thruster_*` node; M13 replaces it with flame/heat VFX at the same nodes.
