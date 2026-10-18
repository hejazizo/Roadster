# Performance baseline

Measured at v0.1 (M10) to have something to compare against when M12–M16 add real lighting, VFX and level art. Re-measure after each of those milestones and add a row.

## Frame rate and draw calls

Production build (`BASE_PATH=/Roadster/ npm run build`, `vite preview`), test level, Chrome 155, 30 s scripted run: 5 s on the main menu, then 20 s of driving with steering, boosting and gliding.

| Machine                           | Canvas    | Scene   | FPS (mean) | p95 frame | Draw calls / frame | Triangles / frame |
| --------------------------------- | --------- | ------- | ---------- | --------- | ------------------ | ----------------- |
| MacBook Pro 16" M2 Max            | 2560×1440 | menu    | 60.0       | 17.5 ms   | 47                 | 15.3k             |
| MacBook Pro 16" M2 Max            | 2560×1440 | driving | 59.9       | 17.4 ms   | 34 avg, 47 max     | 10.5k avg         |
| same, CPU throttled 4× (DevTools) | 2560×1440 | driving | 60.0       | 17.5 ms   | 34 avg, 47 max     | 10.5k avg         |

All runs sit at the 60 Hz display's vsync cap, so there is headroom we haven't measured. Draw calls include the shadow pass: every shadow-casting mesh is drawn twice. The menu draws more than driving because from spawn the camera looks out over most of the level; while driving, frustum culling drops whatever is behind or beside the car.

Where the draw calls come from: 23 level boxes and ramps, 3 drei `<Grid>` planes (one per ground slab), the road ribbon, 8 rings and the car (body, 4 wheels, 2 thruster discs), with the shadow pass on top.

## Bundle

`npm run build`, Vite 8 (Rolldown). Vendor code is split out (`vite.config.ts`), so a game change only re-downloads `index`.

| Chunk         | Raw     | Gzip   | Notes                                              |
| ------------- | ------- | ------ | -------------------------------------------------- |
| `rapier`      | 2.24 MB | 842 kB | Rapier with its WASM inlined as base64             |
| `three`       | 1.05 MB | 283 kB | three, R3F, drei and their helpers                 |
| `react`       | 207 kB  | 64 kB  | react, react-dom, scheduler                        |
| `index`       | 28 kB   | 11 kB  | the game                                           |
| `TuningPanel` | 209 kB  | 71 kB  | leva, loaded only the first time ` opens the panel |
| `car.glb`     | 184 kB  | 40 kB  | `public/models/car.glb`, fetched once at startup   |

The first load is about 1.2 MB gzipped, nearly 70% of it Rapier.

## How to measure again

- **FPS by eye**: Chrome DevTools → ⋮ → More tools → Rendering → _Frame rendering stats_.
- **Draw calls and triangles**: with an init script, wrap `WebGL2RenderingContext.prototype.drawArrays` / `drawElements` (and the `*Instanced` versions) to count calls and `count / 3` triangles for `TRIANGLES` draws, then read and reset the counters in a `requestAnimationFrame` callback registered before the app starts. `renderer.info` from R3F gives the same numbers from inside the app.
- **Weaker machines**: DevTools → Performance → CPU throttling, or `Emulation.setCPUThrottlingRate` over CDP. This only slows the CPU (physics, React, three's scene traversal), not the GPU.

## Levers for M18

- Shadow map: one 2048² map that follows the car. Drop it to 1024² on low settings, or stop drawing small props into it.
- Grid: three `<Grid>` shader planes could become one, or a texture on the ground material.
- Instancing for repeated level pieces (barriers, rings, future props) once real level art adds many copies.
- Rapier dominates the download, not the frame time. Lazy-loading physics behind the menu would make first paint faster, but `@react-three/rapier` imports Rapier statically, so it needs a wrapper or an upstream change.
