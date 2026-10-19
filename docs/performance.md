# Performance baseline

Measured at v0.1 (M10) to have something to compare against when M12–M16 add real lighting, VFX and level art. Re-measure after each of those milestones and add a row.

## Frame rate and draw calls

Production build (`BASE_PATH=/Roadster/ npm run build`, `vite preview`), test level, Chrome 155, 30 s scripted run: 5 s on the main menu, then 20 s of driving with steering, boosting and gliding.

| Machine                           | Canvas    | Scene   | FPS (mean) | p95 frame | Draw calls / frame | Triangles / frame |
| --------------------------------- | --------- | ------- | ---------- | --------- | ------------------ | ----------------- |
| MacBook Pro 16" M2 Max            | 2560×1440 | menu    | 60.0       | 17.5 ms   | 47                 | 15.3k             |
| MacBook Pro 16" M2 Max            | 2560×1440 | driving | 59.9       | 17.4 ms   | 34 avg, 47 max     | 10.5k avg         |
| same, CPU throttled 4× (DevTools) | 2560×1440 | driving | 60.0       | 17.5 ms   | 34 avg, 47 max     | 10.5k avg         |
| **M11** hero car, M2 Max          | 1280×800  | menu    | 60.0       | 16.7 ms   | 49                 | 290k              |
| **M11** hero car, M2 Max          | 1280×800  | driving | 60.0       | 16.7 ms   | 37 avg, 50 max     | 281k avg          |
| same, CPU throttled 4× (DevTools) | 1280×800  | driving | 60.0       | 16.7 ms   | 36 avg, 50 max     | 282k avg          |
| **M12** materials + HDRI, M2 Max  | 1280×800  | menu    | 60.0       | 16.8 ms   | 60                 | 287k              |
| **M12** materials + HDRI, M2 Max  | 1280×800  | driving | 60.0       | 16.7 ms   | 53 avg, 61 max     | 284k avg          |
| same, CPU throttled 4× (DevTools) | 1280×800  | driving | 60.0       | 16.8 ms   | 53 avg, 61 max     | 284k avg          |
| **M13** VFX + post, M2 Max        | 1280×800  | menu    | 60.0       | 16.8 ms   | 79                 | 287k              |
| **M13** VFX + post, M2 Max        | 1280×800  | driving | 60.0       | 16.7 ms   | 75 avg, 85 max     | 284k avg          |
| same, CPU throttled 4× (DevTools) | 1280×800  | driving | 60.0       | 16.7 ms   | 75 avg, 85 max     | 284k avg          |
| **M14** audio, M2 Max             | 1280×800  | menu    | 60.0       | 16.8 ms   | 79                 | 287k              |
| **M14** audio, M2 Max             | 1280×800  | driving | 60.0       | 16.7 ms   | 75 avg, 85 max     | 284k avg          |
| same, CPU throttled 4× (DevTools) | 1280×800  | driving | 60.0       | 16.7 ms   | 75 avg, 85 max     | 284k avg          |

All runs sit at the 60 Hz display's vsync cap, so there is headroom we haven't measured. Draw calls include the shadow pass: every shadow-casting mesh is drawn twice. The menu draws more than driving because from spawn the camera looks out over most of the level; while driving, frustum culling drops whatever is behind or beside the car.

Where the draw calls come from: 23 level boxes and ramps, 3 drei `<Grid>` planes (one per ground slab), the road ribbon, 8 rings and the car (body, 4 wheels, 2 thruster discs until M13), with the shadow pass on top.

**M11** (headless Chrome 155, same script, 1280×800 canvas): the hero car is 139k triangles (body 95k + 4 × 11k wheel) and is drawn twice per frame, once for the shadow map, so it accounts for ~278k of the ~285k triangles per frame. Its front-arch liners add one draw call (two with the shadow pass). Still pinned at vsync, also with the CPU throttled; the GPU cost of the triangles isn't measured beyond that. If the car ever shows up in a profile, cast its shadow from a decimated copy or drop the wheels from the shadow pass (M18).

**M12** (same setup): the car is split into materials, so it is 5 body primitives (paint, glass, carbon, tail lights, head light bar) plus the liners, and 2 per wheel (tyre, rim), where M11 had one body, one liner and one per wheel primitive. That is 8 more draw calls, 16 with the shadow pass, which is the whole increase; triangles are unchanged (the light bar adds 96). Paint and carbon are `MeshPhysicalMaterial` with clearcoat and everything samples the sky HDRI's PMREM, and frames still sit at vsync, also with the CPU throttled. The sun's shadow box shrank from ±20 m to ±15 m at the same 2048² map, so shadow texels are 1.5 cm instead of 2 cm.

**M13** (same setup): the post-processing chain is most of the +19 calls on the menu. Bloom's mipmap blur is a luminance pass plus a down- and upsample chain, then come the speed blur (its own pass, since it samples neighbouring pixels) and the final pass with vignette and tone mapping. These are full-screen passes, so their GPU cost grows with the canvas size, which these runs (1280×800) don't stress. The scene itself gained the two particle pools (embers, dust/smoke) and the tire marks (once there are any), lost the two thruster discs, and draws 6 more calls while thrusting (2 cones and a glow sprite per nozzle). None of the effects casts a shadow. The composer renders at the canvas resolution with 4× MSAA on a half-float target. On low settings (M18) the bloom could run at half resolution and the speed blur could be dropped.

**M14** (same setup, audio running from the first Enter): no change on the GPU side. Sound runs on the browser's audio thread:

- the car keeps 4 oscillators and 6 looping noise sources playing;
- the music starts 1–2 short notes per 16th (8 at the top of each bar for the pad);
- one-shots add a few nodes each.

The main thread only sets about 15 audio parameters per frame and wakes a 25 ms timer for the sequencer, so frames stay pinned at vsync with the CPU throttled 4×.

**M16.1** (same setup, start of a run): the Proving Ground draws 72 calls and ~290k triangles per frame from spawn, against 79 calls on the Test Track; it has fewer pieces (one ground slab and grid, 4 walls, the half-loop, 5 parked boxes, 6 rings). The half-loop is one mesh of ~1.6k triangles (the trimesh collider uses the same triangles). Still at vsync, 60 fps while driving.

**M16.3** (same setup): 73 calls per frame at the Proving Ground spawn. The eight cold-gas plumes (two cones and a glow each) are hidden while idle; holding lift on the floor draws 85 (the four underbody plumes plus the vapour pool), and a roll adds the two firing side plumes. The vapour is one more 700-point pool in a single draw call. 60 fps both ways. The `jet_*` empties don't change the car's size (1.76 MB).

**M16.4** (same setup): still 73 calls and ~294k triangles at the Proving Ground spawn, 67 beside the fleet. The five parked cars replace the five boxes one for one: each is a single mesh with one vertex-coloured material (552–1,308 triangles, 4k in all), so one call each, two with the shadow pass. 60 fps at spawn, at the fleet and through the kickflip.

**M16.6** night art (same setup, headless Chrome over CDP, HEAD rebuilt and measured alongside): the Proving Ground spawn goes from 73 to 81 calls (~294k → 321k triangles) and the reveal run's start from 67 to 76; the Test Track is unchanged at 80. 60 fps everywhere (p95 16.7–16.8 ms). The art is about 18 meshes in place of the greybox walls, slab and grid and their shadow-pass draws:

- the sky dome, the land out to the horizon, the pad's asphalt, the road, and two marking meshes (areas, lines);
- barriers and fence posts (instanced, ~400 each), one fence mesh;
- floodlight masts, lamp frames and lamps (instanced, 14 towers), all the light beams in one mesh;
- the half-loop's red strips, and the scenery: one vertex-coloured mesh, one for windows and lamps, and two point sets (aviation beacons, town lights).

None of the art casts a shadow. Lighting is the moon (the one shadow caster), the environment map, and six spot lights without shadows (five floodlights and the car's head lights): they add no draw calls but every lit material loops over them per pixel. The other floodlights light the asphalt with analytic pools in the ground shader instead of lights. The environment is rendered once at load from the sky shader plus a lamp panel per tower (`PMREMGenerator.fromScene`).

## Bundle

`npm run build`, Vite 8 (Rolldown). Vendor code is split out (`vite.config.ts`), so a game change only re-downloads `index`.

| Chunk         | Raw     | Gzip    | Notes                                                                                                                                              |
| ------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rapier`      | 2.24 MB | 842 kB  | Rapier with its WASM inlined as base64                                                                                                             |
| `three`       | 1.19 MB | 326 kB  | three, R3F, drei, postprocessing and helpers (M12 `<Environment>` + HDR loader +18 kB, M13 post +25 kB gzip)                                       |
| `react`       | 207 kB  | 64 kB   | react, react-dom, scheduler                                                                                                                        |
| `index`       | 148 kB  | 53 kB   | the game (M14 audio +4 kB gzip; M16.7 UI with lucide icons +3 kB gzip; M16.6 night art +11 kB gzip; M16.8 gauge, sheets, glyphs, nav +4.8 kB gzip) |
| `index.css`   | 29 kB   | 6.4 kB  | overlay styles (M16.7 redesign +2.4 kB gzip, M16.8 +2 kB gzip)                                                                                     |
| fonts         | 111 kB  | 111 kB  | M16.7: IBM Plex Mono 400/500 latin woff2, bundled (2 × 15 kB); Satoshi 400/500/700 from Fontshare (3 × 27 kB)                                      |
| `TuningPanel` | 209 kB  | 71 kB   | leva, loaded only the first time ` opens the panel                                                                                                 |
| `car.glb`     | 1.76 MB | 1.42 MB | `public/models/car.glb` (hero car, M12 materials), fetched once at startup: Meshopt geometry, WebP textures                                        |
| `fleet/*.glb` | 62 kB   | 30 kB   | `public/models/fleet/` (M16.4 parked cars, 9–21 kB each), Meshopt geometry, preloaded at startup                                                   |
| sky HDRI      | 1.44 MB | 954 kB  | `public/hdri/…_1k.hdr` (1024×512 RGBE), day levels only since M16.6, doesn't block startup (own Suspense)                                          |

The first load is about 3.6 MB gzipped (M13 added ~30 kB, M16.7's UI redesign ~120 kB, almost all fonts): Rapier 842 kB, the car 1.42 MB, the sky 954 kB. Since M16.6 the night sky is generated in code, so the sky HDRI is only fetched for a day level; since M16.8 the Test Track is out of the game, so it isn't fetched at all and the first load is about 2.7 MB. The car is already Meshopt-compressed, so gzip barely helps; of its textures the 2048² atlas is 86 kB, the paint shade map 125 kB and the carbon weave 0.5 kB, the rest is geometry. M12 added 210 kB to the car: the shade map, and the extra vertices along the new material seams. At M10, with the 184 kB placeholder car and no HDRI, the first load was 1.2 MB; at M11 2.4 MB.

## How to measure again

- **FPS by eye**: Chrome DevTools → ⋮ → More tools → Rendering → _Frame rendering stats_.
- **Draw calls and triangles**: with an init script, wrap `WebGL2RenderingContext.prototype.drawArrays` / `drawElements` (and the `*Instanced` versions) to count calls and `count / 3` triangles for `TRIANGLES` draws, then read and reset the counters in a `requestAnimationFrame` callback registered before the app starts. `renderer.info` from R3F gives the same numbers from inside the app.
- **Weaker machines**: DevTools → Performance → CPU throttling, or `Emulation.setCPUThrottlingRate` over CDP. This only slows the CPU (physics, React, three's scene traversal), not the GPU.

## Levers for M18

- Shadow map: one 2048² map that follows the car. Drop it to 1024² on low settings, or stop drawing small props into it.
- Sky HDRI: a 512×256 copy would be about a quarter of the 954 kB, at the cost of softer clearcoat reflections.
- Car materials: on low settings, `MeshStandardMaterial` instead of clearcoat `MeshPhysicalMaterial`, and the light bar, tail lights and glass left out of the shadow pass.
- Grid: three `<Grid>` shader planes could become one, or a texture on the ground material.
- Instancing for repeated level pieces (barriers, rings, future props) once real level art adds many copies.
- Rapier dominates the download, not the frame time. Lazy-loading physics behind the menu would make first paint faster, but `@react-three/rapier` imports Rapier statically, so it needs a wrapper or an upstream change.
