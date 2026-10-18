// Physics targets shared by the car model build scripts: where TUNING.car puts the wheels,
// so the built GLB lines up with the physics (docs/car-model-spec.md).
import type { vec3 } from '@gltf-transform/core'
import RAPIER from '@dimforge/rapier3d-compat'
import { TUNING } from '../src/config/tuning.ts'

export const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

const { chassis, wheels, suspension } = TUNING.car

// Indices into TUNING.car.wheels.positions (FL, FR, RL, RR).
export const FRONT = [0, 1]
export const REAR = [2, 3]

// Wheel hubs with the suspension fully extended, chassis-local. This is where the wheel nodes
// go, and where the wheels hang while the car is in the air.
export const hubs: vec3[] = wheels.positions.map(([x, y, z]) => [x, y - suspension.restLength, z])
// The ground line under those hubs.
export const ground = mean(hubs.map((h) => h[1])) - wheels.radius
export const frontZ = mean(FRONT.map((i) => hubs[i][2]))
export const rearZ = mean(REAR.map((i) => hubs[i][2]))

// How far the suspension compresses under the car's own weight: settle the car on flat ground
// in Rapier with the current tuning, as Car.tsx sets it up. At rest the wheels sit this much
// higher than `hubs`, so bodywork fitted around the loaded hubs has its wheels centred in the
// arches while driving.
async function measureRestSag() {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: TUNING.world.gravity[1], z: 0 })
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 1, 10).setTranslation(0, -1, 0))
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0).setCanSleep(false),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(...chassis.halfExtents).setMass(chassis.mass),
    body,
  )
  const vc = world.createVehicleController(body)
  vc.indexUpAxis = 1
  vc.setIndexForwardAxis = 2
  wheels.positions.forEach(([x, y, z], i) => {
    vc.addWheel(
      { x, y, z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      suspension.restLength,
      wheels.radius,
    )
    vc.setWheelMaxSuspensionTravel(i, suspension.maxTravel)
    vc.setWheelSuspensionStiffness(i, suspension.stiffness)
    vc.setWheelSuspensionCompression(i, suspension.compression)
    vc.setWheelSuspensionRelaxation(i, suspension.relaxation)
    vc.setWheelMaxSuspensionForce(i, suspension.maxForce)
    vc.setWheelBrake(i, 1)
  })
  for (let step = 0; step < 300; step++) {
    vc.updateVehicle(world.timestep)
    world.step()
  }
  const lengths = wheels.positions.map(
    (_, i) => vc.wheelSuspensionLength(i) ?? suspension.restLength,
  )
  world.free()
  return suspension.restLength - mean(lengths)
}
export const restSag = await measureRestSag()
