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

All runs sit at the 60 Hz display's vsync cap, so there is headroom we haven't measured. Draw calls include the shadow pass: every shadow-casting mesh is drawn twice. The menu draws more than driving because from spawn the camera looks out over most of the level; while driving, frustum culling drops whatever is behind or beside the car.

Where the draw calls come from: 23 level boxes and ramps, 3 drei `<Grid>` planes (one per ground slab), the road ribbon, 8 rings and the car (body, 4 wheels, 2 thruster discs), with the shadow pass on top.

**M11** (headless Chrome 155, same script, 1280×800 canvas): the hero car is 139k triangles (body 95k + 4 × 11k wheel) and is drawn twice per frame, once for the shadow map, so it accounts for ~278k of the ~285k triangles per frame. Its front-arch liners add one draw call (two with the shadow pass). Still pinned at vsync, also with the CPU throttled; the GPU cost of the triangles isn't measured beyond that. If the car ever shows up in a profile, cast its shadow from a decimated copy or drop the wheels from the shadow pass (M18).

**M12** (same setup): the car is split into materials, so it is 5 body primitives (paint, glass, carbon, tail lights, head light bar) plus the liners, and 2 per wheel (tyre, rim), where M11 had one body, one liner and one per wheel primitive. That is 8 more draw calls, 16 with the shadow pass, which is the whole increase; triangles are unchanged (the light bar adds 96). Paint and carbon are `MeshPhysicalMaterial` with clearcoat and everything samples the sky HDRI's PMREM, and frames still sit at vsync, also with the CPU throttled. The sun's shadow box shrank from ±20 m to ±15 m at the same 2048² map, so shadow texels are 1.5 cm instead of 2 cm.

## Bundle

`npm run build`, Vite 8 (Rolldown). Vendor code is split out (`vite.config.ts`), so a game change only re-downloads `index`.

| Chunk         | Raw     | Gzip    | Notes                                                                                                       |
| ------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `rapier`      | 2.24 MB | 842 kB  | Rapier with its WASM inlined as base64                                                                      |
| `three`       | 1.10 MB | 301 kB  | three, R3F, drei and their helpers (M12 added drei's `<Environment>` and the HDR loader: +18 kB gzip)       |
| `react`       | 207 kB  | 64 kB   | react, react-dom, scheduler                                                                                 |
| `index`       | 31 kB   | 12 kB   | the game                                                                                                    |
| `TuningPanel` | 209 kB  | 71 kB   | leva, loaded only the first time ` opens the panel                                                          |
| `car.glb`     | 1.76 MB | 1.42 MB | `public/models/car.glb` (hero car, M12 materials), fetched once at startup: Meshopt geometry, WebP textures |
| sky HDRI      | 1.44 MB | 954 kB  | `public/hdri/…_1k.hdr` (1024×512 RGBE), fetched at startup but doesn't block it (own Suspense)              |

The first load is about 3.6 MB gzipped: Rapier 842 kB, the car 1.42 MB, the sky 954 kB. The car is already Meshopt-compressed, so gzip barely helps; of its textures the 2048² atlas is 86 kB, the paint shade map 125 kB and the carbon weave 0.5 kB, the rest is geometry. M12 added 210 kB to the car: the shade map, and the extra vertices along the new material seams. At M10, with the 184 kB placeholder car and no HDRI, the first load was 1.2 MB; at M11 2.4 MB.

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
