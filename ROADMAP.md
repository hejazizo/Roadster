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

| #    | Milestone                      | Phase       | Status |
| ---- | ------------------------------ | ----------- | ------ |
| 0    | Project scaffold               | 1 · Core    | ☑      |
| 1    | Drivable box car               | 1 · Core    | ☑      |
| 2    | Chase camera                   | 1 · Core    | ☑      |
| 3    | Boost, hop & glide             | 1 · Core    | ☑      |
| 4    | Basic HUD                      | 1 · Core    | ☑      |
| 5    | Greybox test world             | 1 · Core    | ☑      |
| 6    | Ring time-trial loop           | 2 · Game    | ☑      |
| 7    | Menus & saved best times       | 2 · Game    | ☑      |
| 8    | Input mapping & gamepad        | 2 · Game    | ☑      |
| 9    | Placeholder car model (GLB)    | 2 · Game    | ☑      |
| 10   | Stable v0.1 & deploy           | 2 · Game    | ☑      |
| 11   | Hero Roadster model            | 3 · Details | ☑      |
| 12   | Lighting & materials           | 3 · Details | ☑      |
| 13   | Thruster VFX & post-processing | 3 · Details | ☑      |
| 14   | Audio                          | 3 · Details | ☑      |
| 15   | Handling & flight polish       | 3 · Details | ☑      |
| 16.1 | Reveal: proving-ground greybox | 3 · Details | ☑      |
| 16.2 | Reveal: suction & half-loop    | 3 · Details | ☑      |
| 16.3 | Reveal: jets, air roll & drop  | 3 · Details | ☑      |
| 16.4 | Reveal: fleet jump             | 3 · Details | ☐      |
| 16.5 | Reveal: stunt run mode         | 3 · Details | ☐      |
| 16.6 | Reveal: night facility art     | 3 · Details | ☐      |
| 17   | More levels & game modes       | 3 · Details | ☐      |
| 18   | Performance, mobile & settings | 3 · Details | ☐      |
| 19   | Release polish                 | 3 · Details | ☐      |

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

Each milestone here is independent enough to do in any order, apart from M11 → M12 → M13 and M16.1 → M16.6 (in order).

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

✅ **Done:** `scripts/build-car-model.ts` splits the hero car into materials after simplifying: each triangle is sorted by the baked texel under its UV centroid and its position (thresholds measured on rendered views of the source) into `paint`, `glass` (dark above the beltline, opaque and glossy), `carbon` (dark below it: a generated twill weave on box-projected UVs, clearcoat) and `tail_light` (the red rear strip, emissive from the texture); wheels split into `tyre`/`rim` by radius. The source has no head lights, so a `head_light` LED bar is added across the fascia, ray-cast onto the surface. Paint is a grey shade map (texture luminance, flattened) × colour, clearcoat via `KHR_materials_clearcoat`; car.glb 1.76 MB, same bytes on host and Docker. Six paints in `src/config/paints.ts`, picked on the main menu (swatches, ←/→ or A/D, d-pad; new `prev`/`next` actions), saved in localStorage (`src/state/paintStore.ts`); `CarModel.tsx` recolours a clone of the `paint` material. Poly Haven CC0 sky HDRI (1k, its sun within 5° of ours) via drei `<Environment>` replaces the ambient light; Neutral tone mapping (truer paint and greybox colours than ACES); the sun is the only shadow caster, its box ±15 m with near/far, bias and normal bias, and texel-snapped so edges don't shimmer; the car receives shadows. Headless Chrome: every paint from chase and orbit cams, 16 paint-picker checks (persistence, garbage storage, keys, scripted pad, no swatch focus, ignored outside the main menu), 60 fps also with CPU 4× throttle, 53 avg / 61 max draw calls (+16 from the car's materials), first load ~3.6 MB gzipped (`docs/performance.md`).

### M13 — Thruster VFX & post-processing

- Thruster flame and heat particles at the nozzle nodes; intensity tied to boost/glide.
- Dust on landing, tire marks when skidding.
- `@react-three/postprocessing`: bloom, light motion blur, vignette.
- Camera feel: FOV widens on boost, small shake on landing.

**Done when:** boosting and gliding feel powerful just from the visuals.

✅ **Done:** `src/car/telemetry.ts` is stepped with physics after the abilities. It records landings (air time over 0.25 s and fall speed over 2 m/s, with an impact 0–1; teleports never count), a per-wheel skid from the sideways slip speed at the contact point plus a locked handbrake, and a braking flag. `src/vfx/` holds the effects:

- `ThrusterFlame`: two additive HDR cones and a glow sprite per `thruster_*` node, sized to the vents, scaled by a smoothed thrust (boost 1, glide 0.55) and flickering; it replaces the disc.
- `Particles`: one-draw-call world-space point pools for embers and heat behind the nozzles, landing dust and tyre smoke.
- `TireMarks`: a ring buffer of 3000 quads following the contact normal.

Everything freezes while paused and clears on restart. `src/scene/Effects.tsx` adds `@react-three/postprocessing`: mipmap bloom above luminance 1 (flames, embers, lights, the next ring), a custom radial speed blur (`SpeedBlurEffect`, edges only, from 20 m/s, stronger on boost), a vignette, then Neutral tone mapping, which moved here from the renderer. The chase cam widens 50° → 62° on boost and shakes on landings (trauma model, offset kept out of the follow lerp), and restores the FOV for the orbit cam. Tail lights triple while braking, and gamepads rumble on boost start and landings (`rumble()` in `src/input/input.ts`). Values are in `TUNING.vfx` and `camera.chase`, all in the tuning panel. Headless Chrome:

- boost, glide, hop landing dust, handbrake marks and smoke, and brake lights all render;
- paused frames are pixel-identical;
- colours match M12 within 1/255 outside the vignette;
- a scripted 3 s drive gives the same speed as HEAD (15.89 m/s);
- a scripted pad gets rumbles, and a pad without an actuator throws nothing;
- 60 fps also with CPU 4×, 79 / 75 avg / 85 max draw calls, +30 kB gzipped (`docs/performance.md`).

### M14 — Audio

- Electric motor whine with pitch tied to speed, thruster burst and loop, landing thump, ring pickup, UI clicks, music.
- Volume settings (master / music / SFX).
- Audio starts only after the first user interaction (browser autoplay rules).

**Done when:** every key action has a sound and there are no autoplay errors.

✅ **Done:** all sound and music are synthesized with the Web Audio API in `src/audio/` (no files; +4 kB gzipped). `audio.ts` creates the context only from inside a click or key press (`onUserGesture` in `src/input/input.ts`, checked against `navigator.userActivation`, so Esc or a gamepad press never makes a context the browser would refuse) and routes music and effects through master and a limiter; the tab hiding suspends it. Sounds:

- `CarAudio` (next to `CarEffects`) runs the car's loops: a motor of detuned saws plus an inverter whine, pitched by speed and opened up by throttle; a thruster roar that follows the flame's smoothed thrust, so boost and glide both have it; wind growing with speed², louder in the air; and tyre squeal from wheel skid.
- One-shots fire on changes: boost burst, hop (`telemetry.hops`), landing thump scaled by impact, respawn on R or a fall (`telemetry.respawns`).
- Race sounds come from `raceStore` changes: 3-2-1 beeps and GO, a ring chime climbing a pentatonic scale, and a finish arpeggio (longer for a new best). The menus play confirm / back / tick sounds.
- `music.ts` is a lookahead step sequencer playing a four-bar synthwave loop in A minor: pad and arpeggio on the menus, plus bass and drums during a run.
- Pausing fades out the car and muffles the music.

Master / Music / Effects sliders and a mute toggle (M) sit on the main and pause menus, saved in localStorage (`src/state/audioStore.ts`, junk values ignored). A pad-only player sees "Click or press a key to turn it on" until audio starts. Mix and mapping values are in `TUNING.audio` and the tuning panel. Headless Chrome with `--autoplay-policy=user-gesture-required`, 38 checks:

- no context before a gesture or on Esc, and no autoplay warnings;
- each action's sound fires, and the motor goes 70 → 192 Hz over a 3 s drive;
- pause silences the car and muffles the music;
- sliders, mute, persistence and junk storage all behave;
- the hidden tab suspends the context;
- a pad press first starts the run silently, without errors.

A 3 s drive matches HEAD (15.89 m/s), and frames hold 60 fps also with the CPU throttled 4×.

### M15 — Handling & flight polish

- Tire grip curves, drift / handbrake slides, weight transfer.
- Air control feel, auto-leveling assist, landing stability.
- Optional: assist modes (beginner / pro).

**Done when:** playtesters describe the car as fun to drive and fly, not floaty or twitchy.

✅ **Done:** the driving step moved out of `Car.tsx` into `src/car/handling.ts` (`stepDriving`), so the new headless sim runs the same code as the game. The sim is `scripts/sim-car.ts`, run with `npm run sim:car` or `make sim`: 30-odd checks per assist mode on a flat pad and the test level, run before and after the changes.

- **Driving:**
  - Grip curve per tyre: full grip up to 8° of slip, fading to 75% by 26°.
  - Speed-sensitive steering, with 35% of the lock left at 35 m/s, and a faster return to centre.
  - Engine force fades towards top speed instead of cutting out, with grounded drag and downforce.
  - Weight transfer: Rapier applies tyre forces near the centre of mass, so the car hardly leaned (1° at 1.4 g). A torque from the measured acceleration now gives ~5° of roll in hard corners and 3.7° of dive under braking. It only acts with all four wheels down, so it can't feed a rollover. An anti-roll bar would have removed lean the car didn't have.
- **Arcade drift:**
  - The handbrake, or the rear stepping out under throttle, starts a drift.
  - Rear grip drops to 70%, and to 45% on full throttle, so throttle holds the slide and lifting straightens it.
  - A push along the heading keeps the speed a 45° slide would scrub off.
  - Grip eases back over 0.5 s once the car runs straight; a jump ends the drift.
  - The HUD pill shows "Drifting".
- **Flight:**
  - Glide floats only on the way down: rising, gravity is ×0.5 instead of ×0.25. Hop + hold now peaks at ~4.5 m instead of ~7.5 m.
  - Weaker air control (35%) while plainly airborne.
  - Pitch and roll level to the ground's slope within 6 m of it.
  - Roll and yaw spin are damped for 0.35 s after a landing.
  - Hop buffer (0.15 s), coyote time (0.12 s) and a 0.25 s cooldown. Hops are counted in the abilities state and no longer in telemetry.
- **Assists:** Beginner / Pro (`TUNING.assists`) set counter-steer, a drift-angle hold (35° / 57°), yaw damping, traction control, air levelling and landing damping. The mode is picked on the main and pause menus by click, T or pad Y, saved in localStorage (`src/state/assistStore.ts`, junk ignored). All new values are in tuning-panel folders.
- **From the notes:** a respawn after a fall faces from the fall towards the safe point, away from the drop. The chase cam's wall pull-in is still instant, but it eases back out (`obstructionRelease`). The void ring moved down 0.5 m to fit the tamer climb.

Sim, HEAD → M15 (Beginner):

- **Speed:** 0–25 m/s 4.7 → 5.1 s; top speed 30.1 → 31.0 m/s.
- **Corners:** full-lock skidpad 1.4–1.6 g → 1.9–2.2 g (the front no longer saturates at full lock).
- **Drift:** a 20 m/s handbrake drift held over 15° for 0.5 → 3.1 s when caught, and 5.6 s at 21 m/s when steered to hold 25°. Pro spins if you just hold the turn, and recovers if you counter-steer.
- **Unchanged:** no rollovers; every ring reachable on both modes. The void ring is hit by every hop + glide at 20–45 m/s (4.0–4.7 m at the ring) and missed by every plain or boosted hop (≤ 2.2 m). The 80 m gap needs a glide and can be glided at every speed. Kicker landings stay upright.

Headless Chrome, 21 checks:

- the Assists toggle by T, click and pad Y, persisting, junk storage ignored, ignored while racing, working on the pause menu;
- a drift with marks and smoke and the Drifting pill;
- after driving off the north edge, holding W keeps the car on the island;
- no page errors;
- 60 fps on the M2 Max.

### M16 — The October 15 reveal

The first real level recreates the Roadster reveal of 2026-10-15, held at night at a test site in McGregor, Texas. It had two separate stunts:

1. **Half-loop:** the car climbs a ~20 m (67 ft) inverted half-loop ramp with red edge lights. Underbody fans hold it to the surface (Tesla claims up to 2 g of suction), so it can stop upside down at the top. It then drops off the inverted lip, cold-gas jets roll it ~180° upright and slow its fall, and it lands on flat asphalt in a puff of white vapour.
2. **Fleet jump:** on a separate flat straight with no ramp, the jets lift the car straight off the ground. It flies over five parked vehicles in a row (a sedan, a crossover, an angular pickup, a two-seat robotaxi pod and a semi tractor, the tallest), does a longitudinal roll (the "kickflip") on the way, and lands upright beyond them.

The real run was pre-programmed, with no driver. Here the player does it. The work is split into six milestones, done in order: **mechanics on greybox first, then the mode, then the art.**

**References:**

- Tesla's official replay (YouTube). The ramp starts around 6:03–8:11 and the fleet jump around 10:56–12:08; sources give different timestamps.
- Press reports, e.g. [Fox Baltimore](https://foxbaltimore.com/news/nation-world/flying-cars-are-real-elon-musk-tesla-debuts-new-roadster-dramatic-fashion-ramp-spacex-thruster-texas-0-to-60-mph-second-ramp-performance-thrust-invite-only-reservation-flight-technology) and [Khaleej Times](https://www.khaleejtimes.com/business/auto/tesla-new-roadster-demo-flying-car-spacex-thrusters).
- [roadster.pplx.app](https://roadster.pplx.app/), an interactive physics reconstruction (not a game). It has Ramp and Flight modes, a forces panel with _Wall hold / Ceiling hold / Lift-off / Tire grip_ states, and height, vertical-speed and roll-turns readouts. Its illustrative numbers, as seeds for tuning in g rather than newtons:
  - 2,000 kg car;
  - fan suction up to 39 kN (2 g);
  - jet launch 53 kN up (2.7 g) and 16 kN forward (0.8 g);
  - ten air nozzles fed by ~250 kg of stored air;
  - roll inertia 850 kg·m² and tyre μ 0.9.

  Our car is arcade (150 kg, impulse-based), so convert these to accelerations, not forces.

**Trademark:** the M11 rule still applies. "Tesla", "SpaceX" and the model names stay out of the UI, level names and asset names, so the level is the **Proving Ground** and the parked cars are generic look-alikes by size and silhouette, without badges.

### M16.1 — Reveal: proving-ground greybox

- **New level:** `src/scene/provingGround.ts`, built from the same `Level` data as `testLevel.ts`. It's a large flat asphalt pad (no void; the edges are walls or a berm) holding:
  - the **half-loop zone:** a straight run-up of ≥ 150 m to the ramp, with a wide, clear apron where the car lands from the lip;
  - the **fleet zone:** a separate straight, ≥ 150 m of open asphalt before the row and ≥ 80 m after it;
  - drivable asphalt connecting the two.
- **Half-loop geometry:** add a new `Level` piece (e.g. `loops`), generated from a profile curve as a smooth trimesh collider plus a matching mesh. It's 20 m tall and one car plus margin wide (~5 m), with low side lips. The surface starts flat, curves through vertical and goes on to ~170–180°, so the top section is inverted and overhangs the run-up. Expose height, radius profile, width and end angle as level data, and make the curvature ease in (a clothoid-like entry) so the suspension doesn't bottom out at the transition.
- **Parked fleet as boxes:** five fixed colliders in a row with gaps of ~1.5 m. Approximate sizes (L × W × H, m): sedan 4.7 × 1.9 × 1.45, crossover 4.8 × 1.9 × 1.6, pickup 5.7 × 2.2 × 1.8, pod 3.6 × 1.9 × 1.5, semi tractor 7.0 × 2.6 × 4.0. The row is ~31 m long, and the semi sets the clearance.
- **Ring course:** a short course on the existing race loop that visits both zones. Rings the car can't reach yet (inside the loop, above the fleet) wait for M16.2–M16.4; for now the course runs around the zones.
- **Level choice:** a minimal two-entry choice on the main menu (Proving Ground / Test Track), saved in localStorage. Best times are already per `Level.id`. The full level-select screen stays in M17.
- The sim (`scripts/sim-car.ts`) can load either level, and the test-level checks still pass.

**Done when:** you can pick the Proving Ground, drive the whole pad, run up into the half-loop (and fall off it, as expected without suction), bump into the fleet, and finish its ring course.

✅ **Done:** level types and helpers moved to `src/scene/levelData.ts`; `Level` gains `spawn` (moved out of `TUNING.car`), `surface` (greybox colours only), `loops` and `fleet`. `src/scene/provingGround.ts`:

- a walled 220 × 380 m asphalt pad (6 m walls, the slab runs past them, so no void);
- the half-loop in the west at the end of a ~210 m run-up: 20 m tall, 5 m wide, 175°, a 12 m clothoid entry, then radius 9.7 m; the lip overhangs the entry by ~7 m;
- the fleet in the east: five boxes nose to tail with 1.5 m gaps (31.8 m, semi last), ~215 m of run-up and ~130 m after;
- a 6-ring course around both zones.

`loopProfile` bisects the curvature so the lip ends at the given height, and `loopMesh` extrudes it into a solid (filled under the climb, a 1 m shell past vertical) with 0.5 m side lips, ~1.6k triangles. Both the mesh and a trimesh collider are built from the same triangles. The collider needs Rapier's `FIX_INTERNAL_EDGES`: without it the chassis, scraping with the suspension bottomed out, caught on a triangle edge at ~76° and stopped dead (21 → 6 m/s in one step). @react-three/rapier types `TrimeshCollider` args as two entries but passes them all to Rapier, so the flag goes in third with a cast. The level is picked on the main menu (Proving Ground / Test Track, a segmented pair; L, pad RB or click), saved in localStorage (`src/state/levelStore.ts`, junk ignored, Proving Ground by default; levels listed in `src/scene/levels.ts`). Changing it bumps `runId`, so the car, safe point, tire marks and particles reset. The best time follows the level.

`npm run sim:car` builds its world from either level and takes assist modes and/or level ids as arguments. The test-level output is unchanged from HEAD. New Proving Ground checks, both assist modes:

- a pursuit driver finishes the ring course in order (32.6 s);
- the half-loop with no fans, arriving at 12 / 16 / 20 / 30 / 43 m/s: peaks 8.3 / 13.7 / 18.3 / 19.2 / 19.5 m. At 12 m/s it slides back; from 16 m/s it drops off or goes over the lip, lands on the run-up, mostly on its roof, and never ends up stuck on or behind the ramp;
- driving into the fleet at 20 and 30 m/s stops at the sedan;
- a boosted 45 m/s run holds at the west wall.

Moving a ring fixed the course: the line from the north-end ring to the fleet ring used to run through the parked row. Headless Chrome, 27 checks:

- the picker by L, click and a scripted pad RB; the choice persists; junk and blocked storage fall back to Proving Ground; L does nothing on the pause menu;
- the best time follows the level;
- a closed-loop driver climbs the half-loop to 19.6 m and falls off, stops at the fleet, and finishes the ring course;
- the Test Track spawn and a 3 s drive match HEAD (15.7 m/s in this setup);
- no page errors;
- 60 fps; 72 draw calls at the Proving Ground's spawn vs 79 on the Test Track (`docs/performance.md`).

### M16.2 — Reveal: suction & half-loop

- **Fan suction:** a new held `fans` action (key and pad bindings in `bindings.ts`) adds a force into the surface along the wheels' averaged contact normal while any wheel touches. It's capped at `TUNING.car.suction.maxG` (start at 2 g) and drains fuel. On Beginner it engages on its own on surfaces steeper than ~30°; on Pro you hold it.
- **Make everything work in the car's frame:** check `handling.ts` (downforce, weight transfer, drift push), `abilities.ts` (hop direction, glide, auto-level) and `telemetry.ts` (landing, skids) for world-up assumptions, so driving on a wall or ceiling behaves like driving on the floor. The hop pushes off the surface. Air auto-level stays as it is until M16.3.
- **Ramp physics checks:** the car can climb the loop at speed with fans off if it's fast enough (v² / r > g at the top), and can creep up and **stop inverted** with fans on. The suspension handles the curvature, and the collider-vs-body overhang from the M11 notes doesn't dig into the curve.
- **Chase cam on surfaces:** the camera follows the car's up vector smoothly while it's on a surface (it still uses world up in the air and on the floor), never flips 180° in one frame and never clips through the ramp.
- **Respawn:** R on the ramp or while stuck inverted returns to the last safe point. Safe points are only recorded on level ground, as today.
- **HUD:** a hold state next to the Grounded / Airborne pill (Wall hold / Ceiling hold, like the pplx demo) and a fans meter or flag.
- **Audio:** a fan whine (a filtered noise band) rising with suction.
- **Sim:** fans off, the car slides off the loop below the loop speed; fans on, it climbs from a slow approach, holds inverted for ≥ 3 s, and drives off the top. Speed for a fans-off climb is recorded. No rollovers on the run-up, and all test-level checks still pass.

**Done when:** you can drive up the half-loop, stop upside down under the top section, and drive on off the lip.

✅ **Done:** fans on F / pad LB (`fans` action), stepped in `src/car/abilities.ts` after `updateVehicle`. Decided at the start of the milestone: the fans only press the car into the surface, and **boost does the climbing** (the engine gives ~5.3 m/s², under 1 g).

- **Suction:**
  - Pull = `clamp(holdG − n.y, 0, maxG)`, with n the wheels' averaged contact normal: 0 on the floor, 1 g on a wall, 2 g on a ceiling (`TUNING.car.suction`).
  - The pull is shared out over the wheels in contact, each pulling at its own contact point. Applied at the centre of mass, it turned a car rolling off the lip round its rear axle and up over the edge.
  - It spools up and down, drains fuel with the suction, and stops the ground recharge.
  - Beginner engages it on its own on surfaces steeper than 30° and lets go below 20° (`assists.*.autoFans`).
- **Parking:** under the fans and below 3 m/s with no throttle, the idle brake rises to `holdBrake`. Once all four wheels are down, the car is also anchored where it stopped (static friction, `parkStiffness`). Without the anchor it crept ~0.1 m/s: Rapier's brake acts a step late, the springs on a curve push along it, and its 4 substeps add gravity at ⅝ of a step.
- **In the car's frame:**
  - `handling.ts`: slide angle and aero use the car's plane.
  - `telemetry.ts`: landing impact is the speed into the surface landed on.
  - The hop stays along the car's up, which already pushes off a wall or ceiling. Using the contact normal changed the Test Track hops, which the glide gaps are sized to.
- **Bump stop:** the spring and its damping stiffen up to ×4 over the last 40% of travel, so the chassis no longer touches the loop at any speed (it rubbed from 25 m/s before). It fades in over 0.25–0.5 s after a touchdown, so kicker landings settle as before instead of bouncing.
- **Chase cam:** a smoothed camera up follows the car's while it's grounded and tilted past 20–40°, and world up otherwise.
  - It turns with damping, at most 3 rad/s, and rolls round the view direction when the turn is over ~150°, so it never flips.
  - Heading, offsets, the ground clamp and the wall pull-in are all built on that up; with world up it's the same as before.
- **HUD:** a Wall hold / Ceiling hold pill beside the status, a Fans meter while the fans are engaged, and the speed measured along the car's plane.
- **Audio:** the fan whine is band-passed noise, 900 → 2600 Hz, its level following suction.
- **Respawn:** unchanged. R works anywhere, and safe points still need level ground, though the clothoid's flat foot passes.

Sim (`npm run sim:car`), both assist modes:

- **No fans:** riding over the inverted top needs an arrival of 21.2 m/s (8.2 m/s at the top, √(g·r) = 9.8). Slower runs slide back or drop off and end on the pad. No chassis contact while riding, 12–45 m/s; the suspension no longer bottoms out up to 35 m/s (min 0.13 m vs 0.10 m before).
- **Fans + boost:** climbs from 11.4 m/s, parks under the top for 3.5 s and drives off. That empties the tank: 0.38 fuel at the stop, about 0.42 for 3.5 s of full suction.
- **From 20 / 25 m/s:** parks 3.6–3.9 s with 0 m creep and 0.35–0.49 fuel left, then drops off the lip and ends on the pad.
- **Floor:** holding the fans leaves the rest height unchanged (0.827 m).
- **Test Track:** every check passes. Hops, glide and the void ring match HEAD; kicker landings move 1–2.5 m on 30–90 m jumps (the bump stop on the kicker face).

Headless Chrome, 17 checks:

- F and a scripted pad LB engage the fans on the floor (suction 0, meter shown);
- Beginner auto-fans climb, park 4.4 s with 0.00 m drift, drop off the lip and land;
- the HUD showed the Fans meter, Wall hold and Ceiling hold;
- camera up follows to −0.75 under the top, is back to world up 2.5 s after landing, turns at most 3° per frame, and the ramp never comes between car and camera (0 of ~1,540 frames);
- the fan voice reached gain 0.23 and 2.45 kHz;
- R under the top and on the wall returns the car upright to the run-up;
- Pro without F gets no fans on the wall, and Pro holding F parks under the top;
- no page errors, 60 fps, 72 draw calls at the Proving Ground spawn as in M16.1;
- the Test Track 3 s drive gives 15.71 m/s vs 15.73 on HEAD.

### M16.3 — Reveal: jets, air roll & drop

- **Cold-gas jets:** a held `lift` action pushes along the car's own up vector, up to `TUNING.car.jets.liftG` (~2.7 g, so the car can lift off flat ground), plus a smaller forward push. It drains fuel (one shared bar for now). Because the thrust is body-relative, firing while inverted pushes you down, so you roll first, then brake the fall.
- **Air roll:** a held `airRoll` action plus steer rolls the car about its long axis with a torque from `TUNING.car.jets.rollTorque`. Air auto-level (M3/M15) no longer stops the car from inverting:
  - while you roll, it's off;
  - otherwise it levels toward the nearest of upright or a full turn, so a roll ends upright;
  - Beginner adds an auto-righting assist when the car falls inverted with the ground near.
- **Landing:** landing on the roof or side counts as a bad landing (telemetry flag, camera shake, no respawn). A firm landing on the wheels under lift is a clean one. Landing damping still applies.
- **VFX:** white cold-gas jets and vapour trails at new nozzle empties (`jet_*` nodes added to `scripts/build-car-model.ts` and `docs/car-model-spec.md`: four underbody, two per side for roll), separate from the rear boost flames. A white vapour cloud on landing under lift.
- **Audio:** a high hiss for the jets, scaled by thrust, and a burst on lift-off.
- **HUD:** height above ground, vertical speed and a roll-turns counter in the air.
- **Sim:** from a stop under the inverted top, driving off, rolling and lifting gives an upright landing with an impact below the bad-landing threshold. Doing nothing lands on the roof. A standstill lift-off on flat ground climbs at > 0 m/s. The 80 m gap and void-ring checks are re-run and re-sized if lift makes them trivial (or lift is limited on the test level).

**Done when:** you can drop off the half-loop's lip upside down, roll upright with the jets, slow the fall and land cleanly on all four wheels.

✅ **Done:** lift on G / pad RB (`lift`), air roll on E / pad X (`airRoll`, the handbrake's button, which does nothing in the air) plus steer. Both work on both levels (`Level.jets`, on unless false); values are in `TUNING.car.jets`.

- **Lift:** up to 2.7 g along the car's up, plus 0.3 g forward, at 0.4 fuel/s (2.5 s on a full tank, from the shared bar).
  - **Ground effect:** the push is full within 3 m of the ground below (probed 50 m straight down) and fades to nothing by 12 m, or over a void.
  - **Rise drag:** 1.5 /s while climbing under lift, so it settles at a hover instead of bobbing.
  - So the jets lift off, carry the car a few metres up and brake a fall's last metres. They can't hold it high or replace the glide over the Test Track's void, which is why its gaps didn't need resizing. A 1 s burst from a standstill peaks at 7.7 m.
- **Air roll:** steer adds 14 rad/s² of roll spin, capped at 5 rad/s, and the spin is kept when the steer is let go.
- **Air levelling:**
  - Its error is now the turn that brings the car's up onto the level normal (`up × n` in car axes), which matches the old pitch and roll angles near upright and stays consistent upside down.
  - It holds the car within 80° of upright and lets go by 115°, so an inverted car keeps its attitude, and a roll let go past ¾ turn finishes the full turn.
  - Beginner (`assists.*.autoRight`) rolls an inverted car upright once it's within 1.4 s of hitting the ground.
- **Landings** (`telemetry.ts`):
  - a car touches the ground by a wheel or by the chassis resting on a floor-like surface (Rapier contact manifolds), and air time counts from the last touch;
  - each landing has a kind: `bad` (roof or side, up · n < 0.5, or faster than 14 m/s into the surface), `clean` (on the wheels with lift in the last 0.4 s) or `wheels`;
  - clean and bad landings always count, even soft ones; a bad one adds camera shake (`badLandingShake`) and full rumble, with no respawn;
  - telemetry also has the roll turns since take-off, the height of the hanging wheels above the ground and the vertical speed.
- **VFX:** eight `jet_*` empties in `scripts/build-car-model.ts`: four under the floor blowing down, and two low on each sill blowing outwards. `docs/car-model-spec.md` has a _Jets_ section; `car.glb` is still 1.76 MB and the same bytes in Docker.
  - The plume style moved to `src/vfx/plumes.ts` (the boost `FLAME` and a pale `COLD_GAS`), drawn by `ThrusterFlame` at each jet nozzle and scaled by smoothed jet levels (`TUNING.vfx.jets`).
  - White vapour trails from firing jets, and a vapour cloud rolls out on a clean landing.
- **Audio:** a high band-passed hiss follows lift (roll jets at 40%), and `sfx.jetBurst` plays on lift-off.
- **HUD:** a Jets pill while lifting, an Overturned pill on the roof or side, and while airborne a readout of height, vertical speed and roll turns. The fuel bar shows draining under lift. New tuning-panel folders: _Jets_, _Jets FX_, _Jet sound_.

Sim (`npm run sim:car`), both modes, all checks pass. The pad driving and every Test Track check match HEAD; new checks:

- **Jets on the pad:** a standstill lift-off climbs at 4.0 m/s after 0.3 s. Holds of 0.25 / 0.5 / 2 s peak at 1.1 / 3.5 / 9.4 m.
- **Air roll:**
  - stopped at ¾ turn and let go: lands upright after 0.95–1.03 turns;
  - at ¼ turn: rolls back;
  - stopped inverted: Pro lands on its roof (bad), Beginner is rolled upright.
- **Half-loop drop** (fans, 2 s hold, drive off, roll, lift):
  - from 25 m/s: clean at 4.3–6.1 m/s with 0.46 fuel at the lip;
  - from 22 m/s: clean but firm, 12–13 m/s;
  - from 20 m/s the car parks short of the top and crawls to the lip under the fans, arriving with 0.03 fuel, too little to brake: a bad landing;
  - doing nothing: Pro lands on its roof, and Beginner auto-rights but lands too hard (18 m/s, bad).
- **Test Track with jets** (jets on, so lift has to be no shortcut):
  - hop + lift held falls short of the 80 m gap at every speed, and misses the void ring;
  - lift-off at the edge + glide lands 87–91 m past the edge, against 79–116 for hop + glide;
  - kicker landings stay `wheels` at 9.7–10 m/s.
- **Half-loop, no fans, 16 m/s:** the car now ends on the loop's foot on its roof, where it used to be turned upright; R recovers it, so "back on the pad" now allows the foot.

Headless Chrome, 13 checks:

- eight jet nozzles found;
- lift-off by G and by pad RB, with the Jets pill, air readout and four plumes;
- jet hiss up to gain 0.3;
- an E + D roll let go past ¾ turn lands upright at 1.04 turns, with the side plumes firing;
- pad X + stick rolls;
- a scripted Beginner lip drop from 25 m/s lands clean and upright, with a vapour cloud;
- a Pro drop doing nothing lands on its roof and stays there; R recovers it;
- 60 fps, 73 draw calls at spawn and 85 with the jets firing;
- no page errors or car-model warnings.

### M16.4 — Reveal: fleet jump

- **Kickflip feel:** tune lift, forward push and roll for a jump from the flat straight with no ramp. It lifts off, carries forward over ~31 m of parked cars, does one full roll, and lands upright beyond the row. A full tank allows one jump with some margin, not two in a row.
- **Fleet models:** replace the five boxes with low-poly generic look-alikes. Either model them in a build script (`scripts/build-fleet-models.ts` → `public/models/fleet/*.glb`) or use CC0 assets. Each is ≤ 5k triangles with no badges or names (see the M16 trademark note), and their colliders keep the M16.1 sizes (compound boxes for the pickup's bed and the semi's cab and deck).
- **Clearance and contact:** clipping a parked car counts as a hit (telemetry flag and sound). The car bounces off; the run doesn't stop. The parked cars are fixed (no knock-over physics).
- **Rings:** the ring course gets its rings above the fleet and inside or under the half-loop, now that both are reachable.
- **Sim:** lift + roll from a standing start and from a 20 m/s approach both clear all five without contact. Hop + glide alone can't clear the semi. Every Proving Ground ring is reachable on both assist modes.

**Done when:** you can jump the whole fleet from flat ground with a roll and land upright, and clipping the semi is a real risk.

### M16.5 — Reveal: stunt run mode

- **Reveal run:** a second mode on the Proving Ground, next to its ring time trial, that follows the event: _half-loop → inverted hold → drop & roll → clean landing → fleet jump with kickflip → finish line_. Steps are ordered checkpoints in the race store (a new mode alongside the ring course; the `ready → countdown → racing → finished` phases stay).
- **Scoring:** time plus bonuses for inverted hold time (≥ 2 s counts), roll turns, clean landings and zero fleet contact, and penalties for bad landings and contact. Bronze/silver/gold targets per assist mode, and the best score saved per level and mode (extend `bestTimes.ts`).
- **UI:** an objective banner with the current step and a short hint ("Hold fans on the ceiling"), feedback popups for each step, and a results screen with the breakdown. The mode is picked on the main menu (Proving Ground only).
- **Audio:** step-complete stings that reuse the ring chime style.
- Headless Chrome checks: a scripted run completes every step; each failure path (bad landing, contact, falling off the loop) is scored as specified; the score persists; junk storage is ignored.

**Done when:** a full reveal run can be played start to finish with a score, and replayed for a better one without reloading.

### M16.6 — Reveal: night facility art

The old "real level art" milestone, now for the Proving Ground. Keep the collision shapes as they are; art is a visual layer on top. The Test Track stays greybox.

- **Night lighting** per level:
  - a dim moon key light as the one shadow caster (tight shadow box as in M12);
  - a night HDRI (CC0) for reflections, also used as the background, which closes the M12 sky note;
  - high-intensity white floodlight towers around both zones. A few real spot lights without shadows plus emissive lamp heads, fake light cones and baked light pools on the asphalt, within the draw-call budget.
- **Surfaces:** asphalt with lane and zone markings and patching, and a concrete apron under the loop. The ramp is smooth metallic grey with **red emissive edge strips** that bloom.
- **Props and scenery:** fencing, barriers, light towers, a viewing stand and distant hangars or test structures with no branding, and a horizon with a dark Texas skyline.
- **Effects:** tyre smoke and dust tinted for asphalt at night. Vapour and jets read well under floodlights.
- **Performance:** re-measure FPS and draw calls against `docs/performance.md` and update it. Instance repeated props.

**Done when:** the Proving Ground looks finished in screenshots of both stunts at night, plays the same as at the end of M16.5 (sim unchanged), and holds 60 fps on the M2 Max.

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
- Console shows two deprecation warnings from libraries (`THREE.Clock` from R3F, Rapier init params); they should go away with library updates.
- The circuit road is visual only; give it a collider/surface type if road vs. grass grip matters. Grip is per tyre now (`handling.ts`), so a surface factor would multiply into it (M16.6).
- Ring course: a direction arrow or minimap pointing at the next ring, per-ring split times, and multi-lap races (M17 modes).
- The finish arch sits right ahead of spawn, so the last leg loops back around to pass through it; consider moving spawn or the arch when the level gets real art (the Test Track stays greybox, so M17).
- Gamepad: d-pad / stick focus navigation in menus (needed once menus have more than a few buttons) and a fallback for pads without the "standard" mapping (indices are assumed standard). Key remapping UI is M19; bindings are already data. Rumble (M13) has no on/off setting yet — M18 settings.
- Holding W and S together now cancels to the idle brake (before, W won); same for both triggers.
- The hero body (4.27 m) is centred on the wheelbase, not on its own length, so the nose sticks ~0.15 m past the 4.2 m collider and its lower body (bumpers, sills) hangs below the collider's bottom, as the placeholder's did. On steep kickers the nose can visually dip into the ramp, and the collider's top front corner sits in the air above the sloping hood. Fine for now; revisit if it shows in play — the half-loop (M16.2) is the likely place.
- The car is 139k triangles drawn twice (once for the shadow map) and `car.glb` is 1.2 MB gzipped, half the first load and almost all of it geometry. Options: a decimated shadow-only copy, a lower-poly LOD for low settings, more aggressive simplification — M18.
- The front arch liners are flat dark geometry and the wheel arches have no real inner detail. M12 flattened the baked lighting in the paint (shade map) but glass, trim and wheels still carry it, and the simplified body's shading normals are lumpy, so the clearcoat shows small creases and glints near panel edges. A cleaner model or a normal-map bake would fix both (M16.6/M19 if it matters).
- M12 split the hero model's materials by texture region in the build script. Paint colours are a plain list (`src/config/paints.ts`); M17 unlockables can add a locked flag and more entries (pearl/metallic flake, matte would need their own roughness/metalness per paint).
- The sky HDRI is only used for lighting and reflections; the background is still the flat sky colour. Use it (or a matching skybox) as the background with the real level art — M16.6 uses a night HDRI on the Proving Ground. Its sun is within 5° of `SUN_OFFSET`; keep them together.
- The main menu card covers most of the car at spawn, so a paint change shows only on its rear. A garage/showroom view (camera orbiting the car beside the menu) would show it off — M17 with the level select, or M19.
- Shaded faces of the greybox are dark now that the ambient light is gone (only the sky HDRI fills them); fine for greybox, revisit with real level art (M16.6).
- `postprocessing` 6.39 declares `three <0.187`; bumping three past 0.186 needs a matching postprocessing release.
- Post-processing and particles have no quality setting: on low (M18) run bloom at half resolution, drop the speed blur, and shrink the particle pools. The full-screen passes' GPU cost at large canvases isn't measured yet (the M13 runs were 1280×800 at vsync).
- Dust, tyre smoke and tire marks look the same on every surface (grass, road, platforms); per-surface colours and grip belong with surface types (M16.6). Marks are drawn on any ground the wheels touch, including ramps.
- The chase cam keeps easing towards its target while paused (since M2), so the first moments of a pause still move slightly; the VFX, shake and FOV freeze.
- Volume can only be set with the mouse (sliders) or muted with M; keyboard and gamepad navigation of the sliders belongs to the M18 settings menu. Gamepad presses don't count as a user gesture in browsers, so a pad-only player has to click or press a key once before there is sound.
- Audio has no quality setting: on low (M18) the music could drop its pad (6 saws per bar) and the car its wind and second motor oscillator. Sounds are the same on every surface; tyre and landing sounds per surface type go with M16.6 surfaces. Sounds aren't positional (one listener, the car is always the source); ghosts or other cars would need `PannerNode`s.
- The mix was tuned by measuring levels in a headless browser, not by ear; give it a listening pass with the tuning panel's _Audio mix_ folder (M19).
- Handling (M15) was tuned with the headless sim (`npm run sim:car`) plus a short playtest. The sim's drivers are crude (a P-controller on slide angle), so its numbers say "can be caught" or "can be held", not how it feels. Re-run it after level or tuning changes (M16.x/M17), since the void ring and the 80 m gap are sized to the glide.
- Assists are two fixed presets; the M18 settings menu could expose them one by one (e.g. counter-steer off with drift hold on). Holding full lock after a handbrake on Beginner turns a tight donut. On Pro it spins, unless you counter-steer.
- Drifts have no sound of their own beyond the tyre squeal, and no score; drift scoring could be an M17 mode.
- Reveal (M16) ideas for later:
  - an attract mode on the main menu where the car flies the reveal on autopilot, like the real pre-programmed run;
  - broadcast-style stunt cameras and an instant replay of the last stunt;
  - a separate compressed-air tank for the jets instead of sharing the fuel bar;
  - a debug overlay of force arrows (suction, lift, grip) like the pplx reconstruction;
  - parked cars you can knock over.
- Half-loop trimesh: without `FIX_INTERNAL_EDGES` a scraping chassis stops dead; keep the flag on any future trimesh pieces. M16.2's bump stop keeps the chassis off the loop at every speed, but at 45 m/s the springs still reach the end of their travel.
- Half-loop (M16.2):
  - Parked under the top, the camera looks up the ceiling towards the lip and mostly sees sky; a lower look target on ceilings could show more of the drop.
  - Climbing from a crawl needs boost the whole way and empties the tank by the end of a 3 s hold; M16.5 scoring should allow for that (or the separate air tank from the reveal ideas).
- A safe point can be recorded on the first metres of the loop's clothoid entry (it's level within `flatTolerance`), so R after a loop attempt can put the car at the ramp's foot facing it. Harmless so far; tighten the probe if it bites.
- The bump stop also acts on the Test Track kickers' faces: launches moved 1–2.5 m. Every ring and gap check still passes.
- Both levels spawn at the origin facing north; the Proving Ground's start/finish arch sits on the visual road's south straight, east of spawn.
- Jets (M16.3):
  - **Shared fuel is tight for the drop.** A 25 m/s approach reaches the lip with 0.46 fuel and lands with ~0.1; slower approaches park short of the top and crawl, and arrive empty. M16.4 balances fuel for the fleet jump; M16.5 scoring may want the separate air tank from the reveal ideas.
  - `clean` covers any wheel landing under lift up to the 14 m/s bad threshold, so a firm one counts; M16.5 scoring could grade softness.
  - The roll jets are visual: the roll is a torque on the body, with no side force.
  - Lift fades to nothing by 12 m above the ground and over voids (ground effect); if a later level needs the jets high up, give it its own floor or raise `fadeHeight`.
  - The first physics step's ground probe can't hit anything (the query structures aren't built yet), so height reads ∞ for one step; the HUD shows "—".
