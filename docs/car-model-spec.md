# Car model spec

What a car `.glb` has to look like so it can replace the current one by changing only the asset path. The car's look comes from this file; its physics never does. The collider, wheel positions, wheel radius and suspension all live in `TUNING.car` (`src/config/tuning.ts`), and the model is built to match them.

`public/models/car.glb` follows this spec. It is generated from the hero Roadster model (see [Hero model](#hero-model)); the M9 Kenney placeholder can still be built as a [fallback](#fallback).

## File

- One self-contained binary glTF (`.glb`): geometry, materials and textures embedded.
- Lives in `public/models/`. The path is `CAR_MODEL_URL` in `src/config/assets.ts`, and that's the only line to change for a new car.
- Loaded with drei's `useGLTF`, which also decodes Draco and Meshopt compression (see [Budget](#budget)).

## Units and axes

- **Metres.** Scale 1 in the file; don't rely on a runtime scale.
- **+Y up, +Z forward.** This is glTF's own convention, so **+X is the car's left**.
- **In Blender** (Z up): model the car with its front facing **−Y**, apply all transforms, and export glTF with the default _+Y Up_. Blender's −Y becomes glTF's +Z.
- **Origin = the centre of the physics chassis box**, a `TUNING.car.chassis.halfExtents` box (currently 1.8 × 0.6 × 4.2 m). The bodywork may stick out past the box, but anything far outside it will visibly pass through walls.

## Nodes

Node names may only use letters, digits and `_`. three.js's GLTFLoader turns spaces into `_` and drops `.` `:` `/` `[` `]`, and the lookups below are exact.

| Node                                           | Required | What it is                                                                                                           |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | yes      | One wheel each (front/rear, left/right), **root-level** (direct children of the scene).                              |
| `thruster_*`                                   | no       | Empty nodes marking exhaust nozzles, any number (`thruster_left`, `thruster_right`, …). Can be anywhere in the tree. |
| `jet_under_*`, `jet_left_*`, `jet_right_*`     | no       | Empty nodes marking cold-gas jet nozzles: under the floor (lift) and low on each side (roll). See [Jets](#jets).     |
| everything else                                | —        | Bodywork, rendered as one rigid piece that moves with the chassis. Call the top node `body` by convention.           |

### Materials

Materials render as authored; three's GLTFLoader turns `KHR_materials_clearcoat`, `KHR_materials_emissive_strength` and `KHR_texture_transform` into `MeshPhysicalMaterial` settings, and the scene's sky HDRI gives them reflections.

Two material names mean something to the code:

- **`paint`** (optional): the recolourable paint. The game sets its base colour factor to the paint picked on the main menu (`src/config/paints.ts`), so its base colour texture should be grey: white where the paint is fully lit, darker only for shading and gaps. A model without it just keeps its own colours.
- **`tail_light`** (optional): the tail lights, which should be emissive. Their emissive strength is tripled while braking, and the bloom makes them glow. A model without it has no brake lights.

The hero car's other materials (`glass`, `carbon`, `head_light`, `tyre`, `rim`, `arch_liner`) are names for people, not lookups.

### Wheels

The code moves each wheel node to the physics wheel's position every frame, steers it about Y (front wheels) and spins it about X. The wheel node itself therefore needs:

- **Origin at the hub centre**, the middle of the tyre in all three axes, not its inner face. If the mesh isn't centred, put it in a child node with an offset.
- **Axle along X.** The wheel node's own rotation is kept, so it may flip the wheel (e.g. 180° about Y for a right wheel) as long as the axle stays on X.
- **Radius `TUNING.car.wheels.radius` and width `wheels.width`** (currently 0.33 m and 0.36 m).
- **Placed at the rest hub position** from `wheels.positions`, minus `suspension.restLength` in Y. Currently:

  | Node       | Position (x, y, z) |
  | ---------- | ------------------ |
  | `wheel_fl` | 0.74, −0.57, 1.3   |
  | `wheel_fr` | −0.74, −0.57, 1.3  |
  | `wheel_rl` | 0.74, −0.57, −1.3  |
  | `wheel_rr` | −0.74, −0.57, −1.3 |

The code ignores the authored position and uses the physics position. That is the suspension fully extended, which is where the wheels hang in the air. Resting on the ground, the car's weight compresses the suspension by the **static sag** (currently 0.073 m), so the wheels sit that much higher. Model the wheel arches around the loaded position (authored position + sag in Y), so the wheels are centred in them while driving and drop a little out of them in the air.

### Thrusters

- Each `thruster_*` empty sits at a nozzle's exit, with its **−Z axis pointing along the exhaust** (backwards on a rear nozzle, so normally no rotation).
- While boosting or gliding, an exhaust flame (two additive cones and a glow sprite, `src/vfx/ThrusterFlame.tsx`) is drawn along each one's −Z, with embers and heat trailing from it. The flame is sized for nozzles about 0.07 m in radius.

### Jets

- Each `jet_*` empty sits at a cold-gas nozzle's exit with its **−Z axis pointing along the exhaust**, like a thruster: straight down for the `jet_under_*` nozzles (lift), outwards for `jet_left_*` and `jet_right_*` (roll).
- While lifting, the `jet_under_*` nozzles draw a pale cold-gas plume (`COLD_GAS` in `src/vfx/ThrusterFlame.tsx`, sized for nozzles about 0.05 m in radius) and trail white vapour. While the car rolls, one side's pair fires. They sit low on the sills, below the centre of mass, so blowing outwards rolls the car towards that side: `jet_right_*` fire when the left side lifts, `jet_left_*` when the right side does.
- The jets push the physics body whether or not a model has them; without the nodes there's just no plume.

## Checks

In `npm run dev`, `src/car/CarModel.tsx` warns in the browser console when:

- a wheel node is missing (that wheel isn't drawn),
- a wheel node isn't root-level,
- a wheel's hub is more than 5 cm from its physics wheel.

A model that loads without these warnings, and has its wheels in its arches and its nose towards +Z, is a drop-in.

## Budget

Targets, so the car doesn't dominate the frame budget:

- ~50k–150k triangles drawn in total (a wheel mesh shared by four nodes counts four times), a handful of materials. Every material is a draw call per mesh, twice with the shadow pass, and the wheels' count four times over.
- Geometry compressed with Meshopt or Draco, and textures as WebP. Use `gltf-transform` (a dev dependency) for both. `useGLTF` decodes WebP out of the box; KTX2 would need a `KTX2Loader` set up in code.

## Hero model

- **Source:** ["Tesla Roadtser 2026"](https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89) by asiphy007 on Sketchfab, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original file is `assets/roadster-2026/source.glb`; title, author, licence and the list of changes are in `assets/roadster-2026/LICENSE.txt`.
- **Credit is required.** It's in the main menu (`CAR_MODEL_CREDIT` in `src/config/assets.ts`), the README and here. The licence covers the model, not the real car's name or design, so keep "Tesla" out of the game's title and UI.
- **What the source is:** one mesh (500k triangles, one material with a baked 2048² texture: silver paint, black glass and trim, a red tail-light strip, no modelled head lights) made of three islands: the body with the front wheels fused in, and the two rear wheels. Already +Y up, nose to +Z, ground at y = 0, but not in metres.
- **Script:** `scripts/build-car-model.ts` (`npm run model:car`, or `make car-model`) converts it into this layout using the current tuning:
  - splits the mesh into islands and takes the left rear wheel as the template for all four wheels: centred on its hub and scaled to the physics radius and width, with right wheels turned 180° about Y;
  - cuts the fused front tyres out of the body (an X-axis cylinder around each front hub) and drops the other rear wheel;
  - closes the opened front arches with dark liners (a cylinder plus an inner disc, clear of the steered wheel);
  - scales the body uniformly so the wheelbase matches the physics, with its ground line on the ground with the car resting on its suspension (the static sag is measured by settling the car in Rapier, `scripts/car-model-targets.ts`);
  - adds `thruster_left`/`thruster_right` at the two outer exhaust vents in the rear diffuser;
  - adds eight `jet_*` empties: four under the floor between the wheels blowing down, and two low on each sill blowing outwards;
  - simplifies the body to ~95k triangles and the wheel to ~11k (139k drawn in all);
  - sorts the simplified triangles into materials by the texel under each triangle (the texture ships in the emissive slot, unlit; the new materials use it as base colour) and the triangle's position in source units, with thresholds measured on rendered views of the source:
    - **`tail_light`**: the red strip across the rear, emissive from the texture itself;
    - **`glass`**: dark texels above the beltline (the canopy runs from the windscreen over the rear deck), smooth and opaque;
    - **`carbon`**: dark texels below it (splitter, sills, rear fascia, arch insides), a generated twill weave on box-projected UVs with clearcoat;
    - **`paint`**: everything else, drawn from a grey **shade map** made from the texture's luminance (brightest paint = white, contrast flattened since the scene lights the car again) times the paint colour, metallic with clearcoat;
    - wheels split by radius into **`tyre`** (rough) and **`rim`** (metallic);
  - adds a **`head_light`** bar (the source has none): an emissive strip across the fascia under the bonnet's lip, fitted to the surface by casting rays at the source;
  - compresses the geometry with Meshopt and the textures (atlas, shade map, weave) to WebP. Output ≈ 1.76 MB.
- Re-run it after changing the chassis, wheel or suspension tuning or the default paint (`PAINTS[0]`, baked in as the `paint` material's own colour), and commit the new `public/models/car.glb`. The output is deterministic: the same bytes on the host and in Docker.

## Fallback

The M9 placeholder, `race-future.glb` from the [Kenney Car Kit](https://kenney.nl/assets/car-kit) (v3.1, CC0 1.0, licence in `assets/car-kit/License.txt`), is still in `assets/car-kit/`. `npm run model:car:kenney` (`scripts/build-car-model-kenney.ts`) builds it into the same `public/models/car.glb`: renamed nodes, body scaled to the wheelbase, wheels centred and resized onto the physics hubs, thrusters on the rear face, texture embedded. It doesn't account for the static sag, so its wheels sit a little high in their arches.
