# Car model spec

What a car `.glb` has to look like so it can replace the current one by changing only the asset path. The car's look comes from this file; its physics never does. The collider, wheel positions, wheel radius and suspension all live in `TUNING.car` (`src/config/tuning.ts`), and the model is built to match them.

The placeholder `public/models/car.glb` follows this spec. It is generated from a Kenney Car Kit car (see [Placeholder](#placeholder)).

## File

- One self-contained binary glTF (`.glb`): geometry, materials and textures embedded.
- Lives in `public/models/`. The path is `CAR_MODEL_URL` in `src/config/assets.ts`, and that's the only line to change for a new car.
- Loaded with drei's `useGLTF`, which also decodes Draco and Meshopt compression (see [Budget](#budget)).

## Units and axes

- **Metres.** Scale 1 in the file; don't rely on a runtime scale.
- **+Y up, +Z forward.** This is glTF's own convention, so **+X is the car's left**.
- **In Blender** (Z up): model the car with its front facing **−Y**, apply all transforms, and export glTF with the default _+Y Up_. Blender's −Y becomes glTF's +Z.
- **Origin = the centre of the physics chassis box**, a `TUNING.car.chassis.halfExtents` box (currently 1.8 × 0.6 × 4.0 m). The bodywork may stick out past the box, but anything far outside it will visibly pass through walls.

## Nodes

Node names may only use letters, digits and `_`. three.js's GLTFLoader turns spaces into `_` and drops `.` `:` `/` `[` `]`, and the lookups below are exact.

| Node                                           | Required | What it is                                                                                                           |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | yes      | One wheel each (front/rear, left/right), **root-level** (direct children of the scene).                              |
| `thruster_*`                                   | no       | Empty nodes marking exhaust nozzles, any number (`thruster_left`, `thruster_right`, …). Can be anywhere in the tree. |
| everything else                                | —        | Bodywork, rendered as one rigid piece that moves with the chassis. Call the top node `body` by convention.           |

### Wheels

The code moves each wheel node to the physics wheel's position every frame, steers it about Y (front wheels) and spins it about X. The wheel node itself therefore needs:

- **Origin at the hub centre**, the middle of the tyre in all three axes, not its inner face. If the mesh isn't centred, put it in a child node with an offset.
- **Axle along X.** The wheel node's own rotation is kept, so it may flip the wheel (e.g. 180° about Y for a right wheel) as long as the axle stays on X.
- **Radius `TUNING.car.wheels.radius` and width `wheels.width`** (currently 0.4 m and 0.3 m).
- **Placed at the rest hub position** from `wheels.positions`, minus `suspension.restLength` in Y. Currently:

  | Node       | Position (x, y, z) |
  | ---------- | ------------------ |
  | `wheel_fl` | 0.85, −0.5, 1.3    |
  | `wheel_fr` | −0.85, −0.5, 1.3   |
  | `wheel_rl` | 0.85, −0.5, −1.3   |
  | `wheel_rr` | −0.85, −0.5, −1.3  |

The code ignores the authored position and uses the physics position, but the bodywork's wheel arches are modelled around the authored one, so the two have to agree.

### Thrusters

- Each `thruster_*` empty sits at a nozzle's exit, with its **−Z axis pointing along the exhaust** (backwards on a rear nozzle, so normally no rotation).
- For now, a placeholder glow disc is drawn at each one while boosting or gliding. M13 attaches the flame and heat VFX to the same nodes.

## Checks

In `npm run dev`, `src/car/CarModel.tsx` warns in the browser console when:

- a wheel node is missing (that wheel isn't drawn),
- a wheel node isn't root-level,
- a wheel's hub is more than 5 cm from its physics wheel.

A model that loads without these warnings, and has its wheels in its arches and its nose towards +Z, is a drop-in.

## Budget

Rough targets for the hero model (M11), so the car doesn't dominate the frame budget:

- ~50k–150k triangles in total, a handful of materials.
- Geometry compressed with Draco or Meshopt, and textures as KTX2. Use `gltf-transform` (already a dev dependency) for both.

## Placeholder

- **Source:** `race-future.glb` from the [Kenney Car Kit](https://kenney.nl/assets/car-kit) (v3.1), CC0 1.0. The licence is in `assets/car-kit/License.txt`. No credit is required, but thanks, Kenney.
- **Script:** `scripts/build-car-model.ts` (`npm run model:car`, or `make car-model`) converts the source into this layout using the current tuning:
  - renames the nodes,
  - scales the body uniformly so the wheelbase matches the physics,
  - puts the body's ground line on the physics ground line at rest,
  - centres and resizes the wheels onto the physics hubs,
  - adds `thruster_left`/`thruster_right` on the rear face,
  - embeds the texture.
- Re-run it after changing the chassis, wheel or suspension tuning, and commit the new `public/models/car.glb`.
