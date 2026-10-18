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
| 10  | Stable v0.1 & deploy           | 2 · Game    | ☑      |
| 11  | Hero Roadster model            | 3 · Details | ☑      |
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

✅ **Done:** live at **https://hejazizo.github.io/Roadster/**. `.github/workflows/deploy.yml` lints, format-checks and builds with `BASE_PATH=/Roadster/` (read in `vite.config.ts`), then deploys to GitHub Pages on every push to `main`; version 0.1.0, tagged `v0.1.0`. Bug bash with a scripted headless-Chrome playthrough (76 checks: every phase transition, pause/blur/unplug, restart, quit, kill-Y respawn, finish and best time across reloads, gamepad) and a 2 min random-input soak: one bug fixed, a hop/reset press made on the pause menu firing on resume (now dropped while paused). leva is lazy-loaded on the first \` press, and vendor code is split into `rapier` / `three` / `react` chunks, so the game chunk is 28 kB. Static "Loading…" in `index.html` until React mounts. Tuning audit found nothing hard-coded. Baseline in `docs/performance.md`: 60 fps (vsync cap) at 2560×1440 on an M2 Max MacBook Pro, also with the CPU throttled 4×; 34–47 draw calls and ~10–15k triangles per frame; 1.2 MB gzipped first load, 70% of it Rapier.

---

## Phase 3 — Details & polish

Each milestone here is independent enough to do in any order, apart from M11 → M12 → M13.

### M11 — Hero Roadster model

**Model chosen:** [Tesla Roadtser 2026](https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89) by asiphy007 on Sketchfab, **CC BY 4.0** (commercial use allowed, author must be credited). From the Sketchfab API on 2026-10-17: 500k triangles, 250k vertices, **1 material, 1 texture**, no animations, published 2026-10-17. Downloads: original `.glb` (29 MB), plus converted glTF/USDZ and 2k/1k-texture GLBs.

**Inspected 2026-10-18.** The file is `assets/roadster-2026/source/source/tesla roadtser 2026.glb` (28.6 MB). Units below are file units; the file isn't in metres.

- **Structure:** one node `model`, one mesh with one primitive: 500k triangles, 632k vertices (250k after welding; the rest are UV-seam splits), with POSITION, NORMAL and TEXCOORD_0. No animations or skins. The mesh is an auto-generated UV atlas with lighting baked into the texture, the usual output of an AI image-to-3D tool.
- **Material:** one material. Its base colour is **black** and the 2048² PNG texture sits in the **emissive** slot, so as shipped it renders unlit: it ignores scene lights and shadows. The build has to move the texture to base colour (roughness ≈ 0.5, metalness 0) and clear the emissive. The baked shading stays in the texture, so lighting is applied twice, mildly. That's acceptable for now; M12 deals with materials.
- **Axes:** already +Y up and **nose towards +Z**, with the ground at y = 0. No rotation is needed.
- **Size:** x −0.413…0.412, y 0…0.502, z −0.946…0.951, so 0.83 wide × 0.50 tall × 1.90 long.
- **Wheels:**
  - The **rear wheels are separate islands** (65.5k and 62.7k triangles), centred at x ≈ ±0.33, y ≈ 0.145, z ≈ −0.628, with radius ≈ 0.145 and width ≈ 0.16.
  - The **front wheels are fused into the body** (one 372k-triangle island), centred at z ≈ 0.525, with roughly the same radius and track.
  - The wheels don't match: the rear ones and the front-right are 5-spoke, while the front-left has a malformed hub.
- **At physics scale:** fitting the wheelbase (1.153 file units) to the physics 2.6 m means a scale of ≈ 2.25. The car becomes ≈ 4.27 m long, 1.86 m wide and 1.13 m tall, with wheels of radius ≈ 0.33 m and width 0.36 m, and a track of ±0.74 m. The current tuning has 0.4 m wheels at ±0.85 m and a 1.8 × 0.6 × 4.0 m collider.
- **Branding:** no Tesla badges or readable text. The rear plate is illegible, and the design reads as a generic wedge supercar.
- **Thruster spots:** four round vents in the rear diffuser below the plate, and two small cylindrical stubs at the lower rear corners.
- **Extra files:** `source/textures/shaded_0.png` is the embedded texture flipped vertically, so it's redundant. `.DS_Store` files are in the folder (now git-ignored).

1. **Tidy the source:** move the GLB to `assets/roadster-2026/source.glb`, drop the duplicate PNG, and commit the source like the Kenney kit (29 MB, under GitHub's 100 MB file limit).
2. **Build script:** `scripts/build-car-model.ts` only handles the Kenney source (its node names, translated-only wheels). Extend it with a second source, or add a sibling script, so that `npm run model:car` / `make car-model` output the hero car in the `docs/car-model-spec.md` layout:
   - scale it uniformly to fit the physics wheelbase, origin at the chassis-box centre (axes already match);
   - **wheels:** take one rear-wheel island as the template. Re-centre it on its hub with the axle on X, and use copies for all four `wheel_*` nodes, mirrored for the other side. Cut the fused front wheels out of the body: drop the triangles inside a cylinder around each front hub, then check the arches for holes. Remove the other rear island too. One template gives four matching wheels and gets rid of the malformed front-left hub;
   - move the texture from emissive to base colour (see findings);
   - `thruster_left` / `thruster_right` empties at the rear stubs or the outer diffuser vents;
   - decimate to ~100–150k triangles (`weld` + `simplify`), Meshopt-compress, keep the texture at 2k and compress it (KTX2 if `toktx` is available in the container, otherwise WebP). Aim for a `car.glb` of about 5 MB or less, and record the size and triangle count in `docs/performance.md`.
3. **Fit the physics to the car, as tuning only:** wheel radius ≈ 0.33, width ≈ 0.36, track ±0.74, wheelbase kept at 2.6 m, and a collider of about 1.8 × ? × 4.2 m sized to the body. Then rebuild the GLB. Smaller wheels change ride height and handling, so re-check with a headless sim like earlier milestones: every ring is still reachable, and the 80 m gap still needs a glide.
4. **Credit (required by CC BY):** a credit line in the main menu, the README, and the source section of `docs/car-model-spec.md`, plus `assets/roadster-2026/LICENSE.txt`. Each needs the title, author, source link and licence link, and a note that the model was modified (decimated, wheels rebuilt from one template, material changed).
5. **Trademark and provenance:** CC BY only covers the modeller's copyright, not Tesla's name, logos or design. Keep "Tesla" out of the game's title and UI. The model has no badges, so the free hobby deploy is fine as it is; a commercial release should still get a check that it doesn't copy Tesla's design. The model looks AI-generated, so it's unlikely to be ripped from a game, but the uploader's licence is only their word. If it turns out to be someone else's work, drop it and fall back to modelling one or buying one licensed for games (not "editorial use only").
6. Replace the _Placeholder_ section of `docs/car-model-spec.md` with a _Hero model_ section. Keep `assets/car-kit/` as a fallback source.

**Done when:** the Roadster replaces the placeholder with no code changes beyond the asset, tuning and the credit line. No spec warnings appear in the console, the car is ≤150k triangles, its wheels spin and steer inside their arches, and `dev`, `build` and `lint` pass.

✅ **Done:** source in `assets/roadster-2026/source.glb` with `LICENSE.txt`. `scripts/build-car-model.ts` (`npm run model:car`, deterministic, same bytes on host and in Docker) splits the mesh into islands by position, uses the left rear wheel as the template for all four (right ones turned 180° about Y), cuts the fused front tyres out of the body, closes the opened front arches with dark liners (a cylinder plus an inner disc, clear of the steered wheel), moves the texture from emissive to base colour, simplifies permissively with UVs as weighted attributes (the atlas's seams blocked the default simplifier) to body 95k + 4 × 11k wheel = 139k triangles, and compresses with Meshopt + WebP to 1.54 MB. Thrusters sit at the two outer exhaust vents. The body is fitted around the _loaded_ hubs: the 0.073 m static sag is measured by settling the car in Rapier (`scripts/car-model-targets.ts`), so wheels sit centred in the arches at rest. The Kenney build moved to `build-car-model-kenney.ts` (`model:car:kenney`). Tuning: wheels 0.33 m radius × 0.36 m at ±0.74, mounts lowered to y −0.17 (chassis box back at its old 0.83 m rest height, roof level with the collider top), collider 1.8 × 0.6 × 4.2 m. Credit in the main menu (`CAR_MODEL_CREDIT` in `src/config/assets.ts`, no "Tesla" in the UI), a new `README.md` and `docs/car-model-spec.md` (_Hero model_ + _Fallback_ sections). Headless Rapier sim, old vs new tuning: rest height, 0–25 m/s, hop, kicker landing, 20 m gap, 80 m gap (glide needed), kicker ring and void ring (hit by every hop + glide 20–45 m/s, missed by every plain hop) all match within noise. Headless Chrome: no spec warnings, wheels steer and spin, glow at the vents; 60 fps also with CPU 4× throttle, 37 avg / 50 max draw calls, ~285k triangles per frame (car drawn twice with the shadow pass), first load ~2.4 MB gzipped (`docs/performance.md`).

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
- First load is ~1.2 MB gzipped, 842 kB of it Rapier's inlined WASM (chunk sizes in `docs/performance.md`). `@react-three/rapier` imports Rapier statically, so lazy-loading physics behind the menu needs a wrapper or an upstream change — M18/M19 (with the loading screen).
- Speed-sensitive steering (less steer angle at high speed) and some drag instead of a hard `maxSpeed` cutoff — M15.
- Hop input buffering / coyote time (press Space just before landing or just after leaving a ledge) — M15. Hop presses are latched for one physics step now; a buffer would keep them a little longer.
- Air control currently works only while gliding; some (weaker) control while plainly airborne may feel better — M15. Glide also lowers gravity on the way up, so hop + hold flies higher (~8 m) than a plain hop; revisit if it feels floaty.
- Console shows two deprecation warnings from libraries (`THREE.Clock` from R3F, Rapier init params); they should go away with library updates.
- Respawn faces the way the car was heading, so after driving off an edge it faces the drop 4 m back; holding W drives straight off again. Consider facing away from the nearest edge, or a short input lockout — M15.
- The circuit road is visual only; give it a collider/surface type if road vs. grass grip matters (M15/M16).
- The chase cam's wall pull-in is an instant clamp, so it can pop when a wall passes between car and camera; damp the release (not the pull-in) in M15.
- Ring course: a direction arrow or minimap pointing at the next ring, per-ring split times, and multi-lap races (M17 modes).
- The finish arch sits right ahead of spawn, so the last leg loops back around to pass through it; consider moving spawn or the arch when the level gets real art (M16).
- Gamepad: d-pad / stick focus navigation in menus (needed once menus have more than a few buttons), rumble on landing and boost (M13/M15), and a fallback for pads without the "standard" mapping (indices are assumed standard). Key remapping UI is M19; bindings are already data.
- Holding W and S together now cancels to the idle brake (before, W won); same for both triggers.
- The hero body (4.27 m) is centred on the wheelbase, not on its own length, so the nose sticks ~0.15 m past the 4.2 m collider and its lower body (bumpers, sills) hangs below the collider's bottom, as the placeholder's did. On steep kickers the nose can visually dip into the ramp, and the collider's top front corner sits in the air above the sloping hood. Fine for now; revisit if it shows in play (M15/M16).
- The car is 139k triangles drawn twice (once for the shadow map) and `car.glb` is 1.2 MB gzipped, half the first load and almost all of it geometry. Options: a decimated shadow-only copy, a lower-poly LOD for low settings, more aggressive simplification — M18.
- The placeholder thruster discs (0.15 m, dark when off) are bigger than the hero car's exhaust vents and cover them; M13's VFX should size the effect to the nozzles.
- The front arch liners are flat dark geometry and the wheel arches have no real inner detail; the baked texture also carries its own lighting — both M12 material work.
- The thruster glow is a flat disc per `thruster_*` node; M13 replaces it with flame/heat VFX at the same nodes.
- The hero model (M11) ships with one material and one baked texture, so M12's clearcoat paint, glass and emissive lights need it split into separate materials first, by texture region or by mesh selection in the build script. Paint-colour choice (M12/M17) also needs the paint isolated from the baked texture, for example with a mask.
