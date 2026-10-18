// Headless handling sim: runs the car's own per-step code (src/car) in Rapier on a flat test
// pad and on the levels, and prints driving, jump, ring and course metrics, so tuning and
// level changes can be checked without playing. `npm run sim:car`, optionally followed by
// assist modes and/or level ids to run only those (e.g. `npm run sim:car beginner proving`).
import { registerHooks } from 'node:module'

// src/ imports leave out the `.ts` extension (Vite resolves them); add it for Node.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (!specifier.startsWith('.') || /\.\w+$/.test(specifier)) throw error
      return next(`${specifier}.ts`, context)
    }
  },
})

const { default: RAPIER } = await import('@dimforge/rapier3d-compat')
const { Quaternion, Vector3 } = await import('three')
const { TUNING } = await import('../src/config/tuning.ts')
const { TEST_LEVEL } = await import('../src/scene/testLevel.ts')
const { PROVING_GROUND } = await import('../src/scene/provingGround.ts')
const { loopMesh, loopProfile, rampVertices } = await import('../src/scene/levelData.ts')
type Level = import('../src/scene/levelData.ts').Level
type Box = import('../src/scene/levelData.ts').Box
const { createAbilityState, stepAbilities } = await import('../src/car/abilities.ts')
const { createDrivingState, stepDriving } = await import('../src/car/handling.ts')
const { createTelemetry, stepTelemetry } = await import('../src/car/telemetry.ts')
const { released } = await import('../src/car/useCarControls.ts')
type CarControls = import('../src/car/useCarControls.ts').CarControls
type Assist = import('../src/car/handling.ts').Assist
type Vec3 = [number, number, number]
type AssistMode = keyof typeof TUNING.assists

await RAPIER.init()

const DT = 1 / 60
const { chassis, wheels, suspension } = TUNING.car
const NORTH = Math.PI
const SOUTH = 0

// ---------------------------------------------------------------- worlds

type Ground = 'pad' | Level

const yawQuat = (yaw: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)

// The level's colliders, as Level.tsx and Race.tsx build them.
function createWorld(ground: Ground) {
  const world = new RAPIER.World({ x: 0, y: TUNING.world.gravity[1], z: 0 })
  world.timestep = DT
  const rings: InstanceType<typeof RAPIER.Collider>[] = []
  const loops: InstanceType<typeof RAPIER.Collider>[] = []
  if (ground === 'pad') {
    world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 1, 2000).setTranslation(0, -1, 0))
    return { world, rings, loops }
  }
  const level = ground
  const cuboid = ({ center, size }: Box) =>
    RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...center)
  for (const piece of [...level.ground, ...level.platforms, ...level.walls]) {
    world.createCollider(cuboid(piece))
  }
  // As Fleet.tsx: the parked cars on their own fixed body, tagged so telemetry counts hits.
  const fleetBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  fleetBody.userData = { fleet: true }
  for (const piece of level.fleet.flatMap((car) => car.boxes)) {
    world.createCollider(cuboid(piece), fleetBody)
  }
  for (const ramp of level.ramps) {
    const points = new Float32Array(rampVertices(ramp).flat())
    world.createCollider(
      RAPIER.ColliderDesc.convexHull(points)!
        .setTranslation(...ramp.start)
        .setRotation(yawQuat(ramp.yaw)),
    )
  }
  // As Level.tsx: without FIX_INTERNAL_EDGES the chassis catches on triangle edges.
  for (const loop of level.loops) {
    const { vertices, indices } = loopMesh(loop)
    loops.push(
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
          .setTranslation(...loop.start)
          .setRotation(yawQuat(loop.yaw)),
      ),
    )
  }
  // As Race.tsx: an upright cylinder sensor turned to face along the ring's yaw.
  for (const { center, yaw, radius } of level.rings) {
    const q = yawQuat(yaw).multiply(
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2),
    )
    rings.push(
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(TUNING.race.ringDepth / 2, radius)
          .setSensor(true)
          .setTranslation(...center)
          .setRotation(q),
      ),
    )
  }
  return { world, rings, loops }
}

// ---------------------------------------------------------------- the car

type Sim = ReturnType<typeof createSim>

// Assist mode for the cars created; each run of the checks sets it.
let mode: AssistMode = 'beginner'

// The car as Car.tsx sets it up, stepped in the same order as its useBeforePhysicsStep.
// `assistOverride` replaces some of the mode's assist values (e.g. no automatic fans).
function createSim(
  ground: Ground,
  position: Vec3,
  yaw: number,
  speed = 0,
  assistOverride: Partial<Assist> = {},
) {
  const { world, rings, loops } = createWorld(ground)
  const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...position)
      .setRotation(rot)
      .setCanSleep(false),
  )
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(...chassis.halfExtents).setMass(chassis.mass),
    body,
  )
  const forward = new Vector3(0, 0, 1).applyQuaternion(rot)
  body.setLinvel({ x: forward.x * speed, y: 0, z: forward.z * speed }, true)
  const vc = world.createVehicleController(body)
  vc.indexUpAxis = 1
  vc.setIndexForwardAxis = 2
  for (const [x, y, z] of wheels.positions) {
    vc.addWheel(
      { x, y, z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      suspension.restLength,
      wheels.radius,
    )
  }
  const driving = createDrivingState()
  const abilities = createAbilityState()
  const telemetry = createTelemetry()
  const ringsHit = new Set<number>()
  let riding = 0 // s on all four wheels
  const assist = { ...TUNING.assists[mode], ...assistOverride }
  const jets = ground === 'pad' || ground.jets !== false
  const contacts = { world, collider }
  const probe = {
    world,
    ray: new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
    flags: RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
  }
  const sim = {
    world,
    body,
    collider,
    rings,
    vc,
    driving,
    abilities,
    telemetry,
    ringsHit,
    time: 0,
    // Steps the chassis touched a half-loop, and the shortest suspension seen, both while
    // riding on all four wheels (maxTravel short of the rest length means bottomed out).
    scrapes: 0,
    minSuspension: Infinity,
    step(c: CarControls) {
      stepDriving(driving, body, vc, c, DT, assist, abilities.suction > 0)
      vc.updateVehicle(DT, probe.flags)
      stepAbilities(abilities, body, vc, c, DT, assist, probe, jets)
      stepTelemetry(telemetry, body, vc, c, DT, abilities, contacts)
      world.step()
      sim.time += DT
      rings.forEach((ring, i) => {
        if (world.intersectionPair(collider, ring)) ringsHit.add(i)
      })
      // Only once riding on all four wheels for a moment: a hard landing or a car tumbling
      // back down the ramp touches it too.
      let scraped = false
      let allWheels = true
      for (let i = 0; i < vc.numWheels(); i++) allWheels &&= vc.wheelIsInContact(i)
      riding = allWheels ? riding + DT : 0
      for (const loop of riding > 0.5 ? loops : []) {
        world.contactPair(collider, loop, (manifold) => {
          if (manifold.numContacts() > 0) scraped = true
        })
      }
      if (scraped) sim.scrapes++
      for (let i = 0; i < vc.numWheels(); i++) {
        const length = vc.wheelSuspensionLength(i)
        if (riding > 0.5 && length !== null) {
          sim.minSuspension = Math.min(sim.minSuspension, length)
        }
      }
    },
    free: () => world.free(),
  }
  return sim
}

const q = new Quaternion()
function pose(sim: Sim) {
  const r = sim.body.rotation()
  q.set(r.x, r.y, r.z, r.w)
  const p = sim.body.translation()
  const v = sim.body.linvel()
  const w = sim.body.angvel()
  const forward = new Vector3(0, 0, 1).applyQuaternion(q)
  const up = new Vector3(0, 1, 0).applyQuaternion(q)
  const flatSpeed = Math.hypot(v.x, v.z)
  // Sideslip: signed angle from the heading to the travel direction on the ground plane.
  const slip =
    flatSpeed > 1
      ? Math.atan2(forward.x * v.z - forward.z * v.x, forward.x * v.x + forward.z * v.z)
      : 0
  return {
    p,
    v,
    up,
    forward,
    flatSpeed,
    speed: Math.hypot(v.x, v.y, v.z),
    // Body angles from level: roll (left side up positive) and pitch (nose up positive).
    roll: Math.asin(new Vector3(1, 0, 0).applyQuaternion(q).y),
    pitch: Math.asin(forward.y),
    yawRate: w.x * up.x + w.y * up.y + w.z * up.z,
    slip,
  }
}

const deg = (rad: number) => (rad * 180) / Math.PI
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x))
const grounded = (sim: Sim) => sim.telemetry.grounded

// Rest height of the chassis centre above flat ground (optionally with the fans held).
function measureRestHeight(fans = false) {
  const sim = createSim('pad', [0, 2, 0], 0)
  for (let i = 0; i < 300; i++) sim.step({ ...released(), handbrake: true, fans })
  const y = sim.body.translation().y
  sim.free()
  return y
}
const REST = measureRestHeight()

// ---------------------------------------------------------------- report

let failures = 0
const rows: string[] = []
function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures++
  rows.push(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(46)} ${detail}`)
}
function info(name: string, detail: string) {
  rows.push(`      ${name.padEnd(46)} ${detail}`)
}
function section(title: string) {
  rows.push('', `== ${title}`)
}
const f1 = (n: number) => n.toFixed(1)
const f2 = (n: number) => n.toFixed(2)

// ---------------------------------------------------------------- driving on the pad

const drive = (over: Partial<CarControls>): CarControls => ({ ...released(), ...over })

// Throttle held from `speed` until the car reaches a steady state, then `controls` for `time`.
function onPad(speed: number, time: number, controls: (t: number, sim: Sim) => CarControls) {
  const sim = createSim('pad', [0, REST, 0], 0, speed)
  const samples: ReturnType<typeof pose>[] = []
  let minUp = 1
  while (sim.time < time) {
    sim.step(controls(sim.time, sim))
    const s = pose(sim)
    samples.push(s)
    minUp = Math.min(minUp, s.up.y)
  }
  return { sim, samples, minUp, last: samples[samples.length - 1] }
}

function straightLine() {
  section('Straight line (flat pad)')
  const sim = createSim('pad', [0, REST, 0], 0)
  const marks: Record<number, number> = {}
  while (sim.time < 12) {
    sim.step(drive({ throttle: 1 }))
    const { flatSpeed } = pose(sim)
    for (const v of [10, 20, 25]) if (marks[v] === undefined && flatSpeed >= v) marks[v] = sim.time
  }
  const top = pose(sim).flatSpeed
  sim.free()
  info('0–10 / 0–20 / 0–25 m/s', [10, 20, 25].map((v) => `${f1(marks[v] ?? NaN)} s`).join(' / '))
  info('speed after 12 s full throttle', `${f1(top)} m/s`)

  const boosted = onPad(30, 3, () => drive({ throttle: 1, boost: true }))
  info('30 m/s + 3 s boost', `${f1(boosted.last.flatSpeed)} m/s`)
  boosted.sim.free()

  const coast = onPad(30, 5, () => released())
  info('coast 5 s from 30 m/s', `${f1(coast.last.flatSpeed)} m/s`)
  coast.sim.free()

  const stop = onPad(30, 10, (_, s) => drive({ throttle: pose(s).flatSpeed > 0.5 ? -1 : 0 }))
  const brakeTime = stop.samples.findIndex((s) => s.flatSpeed < 0.6) * DT
  const dist = Math.abs(stop.samples[Math.round(brakeTime / DT)]?.p.z ?? NaN)
  const dive = Math.min(...stop.samples.map((s) => s.pitch))
  check(
    'brake 30 → 0 m/s',
    dist < 80,
    `${f1(brakeTime)} s, ${f1(dist)} m, nose dive ${f1(deg(-dive))}°`,
  )
  stop.sim.free()
}

function skidpad() {
  section('Skidpad: full lock, throttle held to keep speed')
  for (const v of [10, 20, 30]) {
    const run = onPad(v, 5, () => drive({ throttle: 1, steer: 1 }))
    const tail = run.samples.slice(-60)
    const yaw = tail.reduce((a, s) => a + Math.abs(s.yawRate), 0) / tail.length
    const speed = tail.reduce((a, s) => a + s.flatSpeed, 0) / tail.length
    const slip = Math.max(...tail.map((s) => Math.abs(s.slip)))
    const lat = (speed * yaw) / 9.81
    const roll = Math.max(...tail.map((s) => Math.abs(s.roll)))
    check(
      `${v} m/s: no rollover`,
      run.minUp > 0.5,
      `${f2(lat)} g, yaw ${f2(yaw)} rad/s, ${f1(speed)} m/s, slip ${f1(deg(slip))}°, roll ${f1(deg(roll))}°, min up ${f2(run.minUp)}`,
    )
    run.sim.free()
  }
}

// Steer fully for 0.5 s at 25 m/s, then let go: how far the yaw rate swings back the other
// way (twitchiness) and how long until the car runs straight again.
function stepSteer() {
  section('Step steer at 25 m/s (0.5 s full lock, then release)')
  const run = onPad(25, 4, (t) => drive({ throttle: 1, steer: t < 0.5 ? 1 : 0 }))
  const peak = Math.max(...run.samples.map((s) => Math.abs(s.yawRate)))
  const after = run.samples.slice(Math.round(0.5 / DT))
  const sign = Math.sign(run.samples[Math.round(0.45 / DT)].yawRate)
  const overshoot = Math.max(0, ...after.map((s) => -sign * s.yawRate))
  const settled = after.findIndex(
    (_, i) => i > 0 && after.slice(i).every((x) => Math.abs(x.yawRate) < 0.05),
  )
  const maxSlip = Math.max(...run.samples.map((s) => Math.abs(s.slip)))
  check(
    'no spin',
    maxSlip < Math.PI / 4 && run.minUp > 0.5,
    `peak yaw ${f2(peak)} rad/s, overshoot ${f2(overshoot)} rad/s, settled ${settled < 0 ? '—' : f1(0.5 + settled * DT) + ' s'}, max slip ${f1(deg(maxSlip))}°`,
  )
  run.sim.free()
}

function slalom() {
  section('Slalom at 25 m/s (steer ±1 at 0.5 Hz)')
  const run = onPad(25, 8, (t) => drive({ throttle: 1, steer: Math.sin(Math.PI * t) }))
  const peak = Math.max(...run.samples.map((s) => Math.abs(s.yawRate)))
  const maxSlip = Math.max(...run.samples.map((s) => Math.abs(s.slip)))
  check(
    'no spin or rollover',
    maxSlip < Math.PI / 4 && run.minUp > 0.5,
    `peak yaw ${f2(peak)} rad/s, max slip ${f1(deg(maxSlip))}°, min up ${f2(run.minUp)}, end ${f1(run.last.flatSpeed)} m/s`,
  )
  run.sim.free()
}

// Handbrake with full steer for 0.6 s at 20 m/s, then a driver: `hold` keeps steering into the
// turn on full throttle; `catch` counter-steers against the slide, the way a player would;
// `sustain` steers to hold a 25° slide on full throttle, as in a long drift.
function handbrakeDrift() {
  section('Handbrake drift at 20 m/s (0.6 s handbrake + full steer)')
  const drivers: Record<string, (t: number, s: Sim) => CarControls> = {
    hold: (t) => drive({ throttle: t < 0.6 ? 0 : 1, steer: 1, handbrake: t < 0.6 }),
    catch: (t, s) => {
      if (t < 0.6) return drive({ steer: 1, handbrake: true })
      const { slip } = pose(s)
      return drive({ throttle: 1, steer: Math.max(-1, Math.min(1, slip * 3)) })
    },
    sustain: (t, s) => {
      if (t < 0.6) return drive({ steer: 1, handbrake: true })
      const { slip } = pose(s)
      return drive({ throttle: 1, steer: Math.max(-1, Math.min(1, (slip + deg2rad(25)) * 3)) })
    },
  }
  for (const [name, driver] of Object.entries(drivers)) {
    const run = onPad(20, 6, driver)
    const slips = run.samples.map((s) => Math.abs(s.slip))
    const maxSlip = Math.max(...slips)
    const drifting = slips.filter((s) => s > deg2rad(15)).length * DT
    const spun = maxSlip > Math.PI / 2
    const line = `max slip ${f1(deg(maxSlip))}°, ${f1(drifting)} s over 15°, end slip ${f1(deg(Math.abs(run.last.slip)))}°, end ${f1(run.last.flatSpeed)} m/s`
    if (name === 'catch') check(`${name}: drift caught, no spin`, !spun, line)
    else if (name === 'sustain')
      check(`${name}: held over 2 s, no spin`, !spun && drifting > 2, line)
    else info(`${name}${spun ? ' (spun)' : ''}`, line)
    run.sim.free()
  }
}
const deg2rad = (d: number) => (d * Math.PI) / 180

// ---------------------------------------------------------------- jumps on the level

type Launch = {
  at: Vec3 // ground point to start from (the chassis is placed at rest height above it)
  yaw: number
  speed: number
  // Hop once the car's centre passes this distance along its heading (m from the start).
  hopAt?: number
  glide?: boolean // hold hop after hopping (or once airborne, without a hop)
  glideUntil?: number // let go of glide past this distance along the heading
  probeZ?: number // record the chassis height where the car crosses this z
  boost?: boolean // hold boost the whole time
  // Hold lift between these distances along the heading (on the ground it lifts off), or from
  // the hop on if 'hop'.
  lift?: [number, number] | 'hop'
  time?: number
}

// Drives on full throttle, optionally hops and glides, and follows the car until it has
// landed and settled, or fallen out of the world.
function launch(launchOptions: Launch) {
  const { at, yaw, speed, hopAt, glide, glideUntil = Infinity, boost, probeZ, lift } = launchOptions
  const { time = 12 } = launchOptions
  const sim = createSim(TEST_LEVEL, [at[0], at[1] + REST, at[2]], yaw, speed)
  const start = new Vector3(...at)
  let hopped = false
  let wasAirborne = false
  let landing: { x: number; y: number; z: number; t: number } | null = null
  let lostContactAfterLanding = false
  let minUp = 1
  let peakY = -Infinity
  let airTime = 0
  let heightAtProbe = NaN
  while (sim.time < time) {
    const s = pose(sim)
    const along = new Vector3(s.p.x - start.x, 0, s.p.z - start.z).length()
    const hopNow = hopAt !== undefined && !hopped && along >= hopAt
    if (hopNow) hopped = true
    const airborne = !grounded(sim)
    const lifting = lift === 'hop' ? hopped : !!lift && along >= lift[0] && along < lift[1]
    sim.step(
      drive({
        throttle: 1,
        boost: !!boost,
        lift: lifting,
        hopPressed: hopNow,
        hop:
          !!glide && along < glideUntil && (hopped || hopAt === undefined) && (airborne || hopNow),
      }),
    )
    const after = pose(sim)
    peakY = Math.max(peakY, after.p.y)
    const crossed =
      probeZ !== undefined && Math.sign(after.p.z - probeZ) !== Math.sign(s.p.z - probeZ)
    if (crossed && isNaN(heightAtProbe)) heightAtProbe = after.p.y
    if (!grounded(sim)) {
      airTime += DT
      if (airTime > 0.3) wasAirborne = true
    } else {
      if (wasAirborne && !landing) landing = { ...after.p, t: sim.time }
      airTime = 0
    }
    if (landing && sim.time - landing.t < 1 && !grounded(sim) && sim.time - landing.t > 0.05) {
      lostContactAfterLanding = true
    }
    if (landing) minUp = Math.min(minUp, after.up.y)
    if (after.p.y < TUNING.world.killY) break
    if (landing && sim.time - landing.t > 2) break
  }
  const result = {
    landing,
    fell: sim.body.translation().y < TUNING.world.killY,
    rings: [...sim.ringsHit],
    peakY,
    heightAtProbe,
    minUp,
    bounced: lostContactAfterLanding,
    fuel: sim.abilities.fuel,
    landingKind: sim.telemetry.landings > 0 ? sim.telemetry.landingKind : '—',
    impact: sim.telemetry.landingSpeed,
  }
  sim.free()
  return result
}

const SPEEDS = [20, 25, 30, 35, 40, 45]
const list = (xs: number[], f: (x: number) => string) => xs.map(f).join(' ')

function jumps() {
  section('Jumps (test level)')
  // Big kicker (rises 3.5 m over 16 m) and the ring above it.
  for (const v of [20, 30]) {
    const r = launch({ at: [12, 0, 0], yaw: NORTH, speed: v })
    check(
      `big kicker at ${v} m/s: lands upright`,
      !!r.landing && r.minUp > 0.8,
      `land z ${f1(r.landing?.z ?? NaN)}, ring ${r.rings.includes(0) ? 'hit' : 'missed'}, min up ${f2(r.minUp)}, ${r.bounced ? 'bounced' : 'stuck'}, ${r.landingKind} landing at ${f1(r.impact)} m/s`,
    )
  }
  // 20 m gap north, over the west kicker (−80, z −141 → −149) to the west arm (z ≤ −170).
  for (const v of [25, 30]) {
    const r = launch({ at: [-80, 0, -110], yaw: NORTH, speed: v })
    check(
      `20 m gap north, kicker at ${v} m/s`,
      !r.fell && (r.landing?.z ?? 0) < -170,
      `land z ${f1(r.landing?.z ?? NaN)}`,
    )
  }
  // And back south over the north island's kicker, through the ring at z −160.
  for (const v of [25, 30, 35]) {
    const r = launch({ at: [-40, 0, -215], yaw: SOUTH, speed: v })
    check(
      `20 m gap south at ${v} m/s: lands, ring`,
      !r.fell && r.rings.includes(5),
      `land z ${f1(r.landing?.z ?? NaN)}, ring ${r.rings.includes(5) ? 'hit' : 'missed'}`,
    )
  }
  // Hop over the 20 m gap without the kicker: from x −60 (no kicker), main island edge z −150.
  const hop20 = launch({ at: [-30, 0, -120], yaw: NORTH, speed: 30, hopAt: 29 })
  info(
    '20 m flat gap, hop at 30 m/s',
    hop20.fell ? 'falls' : `lands z ${f1(hop20.landing?.z ?? 0)}`,
  )

  // 80 m gap at x 0: main island edge z −150, north island z ≤ −230.
  const boostHop = launch({ at: [0, 0, -120], yaw: NORTH, speed: 45, hopAt: 29, boost: true })
  check('80 m gap: boost + hop falls short', boostHop.fell, boostHop.fell ? 'falls' : 'lands')
  // The player lets go of glide somewhere over the far island; a speed passes if any of
  // these release points (m from the start; the island begins at 110) lands.
  const crosses = SPEEDS.map((v) =>
    [80, 100, 115].some(
      (glideUntil) =>
        !launch({ at: [0, 0, -120], yaw: NORTH, speed: v, hopAt: 29, glide: true, glideUntil })
          .fell,
    ),
  )
  check(
    '80 m gap: hop + glide crosses at every speed',
    crosses.every(Boolean),
    list(SPEEDS, (v) => `${v}:${crosses[SPEEDS.indexOf(v)] ? 'lands' : 'falls'}`),
  )
  // The jets: lift is weak over the void (it fades with height above the ground), so held
  // from the hop it doesn't carry the car across. Lifting off before the edge and then
  // gliding is the strong line; how far over it lands says whether the gap is still a test.
  const gapLift = SPEEDS.map((v) =>
    launch({ at: [0, 0, -120], yaw: NORTH, speed: v, hopAt: 29, lift: 'hop' }),
  )
  check(
    '80 m gap: hop + lift held falls short',
    gapLift.every((r) => r.fell),
    list(SPEEDS, (v) => `${v}:${gapLift[SPEEDS.indexOf(v)].fell ? 'falls' : 'lands'}`),
  )
  const liftGlide = (lift: [number, number] | 'hop', hopAt?: number) =>
    SPEEDS.map((v) => {
      const runs = [80, 100, 115, 130].map((glideUntil) =>
        launch({ at: [0, 0, -120], yaw: NORTH, speed: v, hopAt, glide: true, glideUntil, lift }),
      )
      const landed = runs.filter((r) => !r.fell && r.landing)
      return landed.length ? Math.max(...landed.map((r) => -r.landing!.z)) - 150 : NaN
    })
  const farthest = (zs: number[]) =>
    list(SPEEDS, (v) => {
      const d = zs[SPEEDS.indexOf(v)]
      return `${v}:${isNaN(d) ? 'falls' : f1(d)}`
    })
  info('80 m gap: lift-off at the edge + glide, m past the edge', farthest(liftGlide([20, 30])))
  info('80 m gap: hop + glide + lift, m past the edge', farthest(liftGlide('hop', 29)))
  info('80 m gap: hop + glide, m past the edge', farthest(liftGlide([0, 0], 29)))
}

function rings() {
  section('Rings (test level)')
  // Void ring (index 3): out over the void north of x 78; the main island ends at z −150.
  const ring = TEST_LEVEL.rings[3]
  const at: Vec3 = [78, 0, -125]
  const probeZ = ring.center[2]
  const glide = SPEEDS.map((v) =>
    launch({ at, yaw: NORTH, speed: v, hopAt: 24, glide: true, probeZ }),
  )
  const plain = SPEEDS.map((v) => launch({ at, yaw: NORTH, speed: v, hopAt: 24, probeZ }))
  const boosted = SPEEDS.map((v) =>
    launch({ at, yaw: NORTH, speed: v, hopAt: 24, boost: true, probeZ }),
  )
  const lifted = SPEEDS.map((v) =>
    launch({ at, yaw: NORTH, speed: v, hopAt: 24, lift: 'hop', probeZ }),
  )
  const liftOff = SPEEDS.map((v) => launch({ at, yaw: NORTH, speed: v, lift: [16, 25], probeZ }))
  const hit = (rs: typeof glide) =>
    list(SPEEDS, (v) => `${v}:${rs[SPEEDS.indexOf(v)].rings.includes(3) ? 'hit' : '–'}`)
  const heights = (rs: typeof glide) => list(SPEEDS, (v) => f1(rs[SPEEDS.indexOf(v)].heightAtProbe))
  check(
    'void ring: every hop + glide hits',
    glide.every((r) => r.rings.includes(3)),
    hit(glide),
  )
  check(
    'void ring: every plain hop misses',
    plain.every((r) => !r.rings.includes(3)),
    hit(plain),
  )
  check(
    'void ring: every boost + hop misses',
    boosted.every((r) => !r.rings.includes(3)),
    hit(boosted),
  )
  const [, cy] = ring.center
  info('ring hole spans y', `${f1(cy - ring.radius)} … ${f1(cy + ring.radius)}`)
  info('height at the ring, hop + glide', heights(glide))
  info('height at the ring, plain hop', heights(plain))
  info('height at the ring, boost + hop', heights(boosted))
  info('void ring: hop + lift held', hit(lifted))
  info('height at the ring, hop + lift held', heights(lifted))
  info('void ring: lift-off at the edge', hit(liftOff))
  info('height at the ring, lift-off at the edge', heights(liftOff))
  info(
    'peak height, hop + glide',
    list(SPEEDS, (v) => f1(glide[SPEEDS.indexOf(v)].peakY)),
  )
  info(
    'peak height, plain hop',
    list(SPEEDS, (v) => f1(plain[SPEEDS.indexOf(v)].peakY)),
  )

  // Raised gap (index 2): two 7 m platforms with an 8 m gap at z −86 … −94.
  for (const v of [12, 15, 20]) {
    const r = launch({ at: [78, 7, -68], yaw: NORTH, speed: v, hopAt: 16, time: 6 })
    check(
      `raised gap at ${v} m/s: hop lands on far platform, ring`,
      !r.fell && (r.landing?.y ?? 0) > 6 && r.rings.includes(2),
      `land z ${f1(r.landing?.z ?? NaN)} y ${f1(r.landing?.y ?? NaN)}, ring ${r.rings.includes(2) ? 'hit' : 'missed'}`,
    )
  }
}

// Hop buffering and coyote time: a press just before landing still hops on touchdown, and so
// does one just after driving off an edge; presses too early or too late don't.
function hopTiming() {
  section('Hop timing')
  // Dropped from 2 m onto the pad, pressing `before` s ahead of the first touchdown.
  const drop = (pressAt: number) => {
    const sim = createSim('pad', [0, REST + 2, 0], 0)
    let touchdown = Infinity
    while (sim.time < 2) {
      const press = Math.abs(sim.time - pressAt) < DT / 2
      sim.step(drive({ hopPressed: press }))
      if (grounded(sim) && touchdown === Infinity) touchdown = sim.time
    }
    const hops = sim.abilities.hops
    sim.free()
    return { touchdown, hops }
  }
  const land = drop(-1).touchdown
  const early = drop(land - 0.1)
  const tooEarly = drop(land - 0.3)
  check('press 0.1 s before landing hops', early.hops === 1, `touchdown ${f2(land)} s`)
  check('press 0.3 s before landing does not', tooEarly.hops === 0, '')

  // Off the main island's north edge (z −150) at 15 m/s, pressing `after` s after leaving it.
  const ledge = (after: number) => {
    const sim = createSim(TEST_LEVEL, [0, REST, -135], NORTH, 15)
    let left = Infinity
    while (sim.time < 3) {
      const press = sim.time >= left + after && sim.time < left + after + DT / 2
      sim.step(drive({ throttle: 1, hopPressed: press }))
      if (!grounded(sim) && left === Infinity && sim.time > 0.2) left = sim.time
    }
    const hops = sim.abilities.hops
    sim.free()
    return hops
  }
  check('press 0.08 s after an edge hops (coyote)', ledge(0.08) === 1, '')
  check('press 0.3 s after an edge does not', ledge(0.3) === 0, '')
}

// ---------------------------------------------------------------- jets on the pad

// Lift held from a standstill for `hold` s (or until the tank first runs dry), then let go:
// how high the wheels get, how fast it climbs, how much fuel it takes and how it lands.
function liftOff(hold: number) {
  const sim = createSim('pad', [0, REST, 0], 0)
  let peak = 0
  let climbAt03 = NaN
  let liftTime = 0
  let fuelUsed = NaN
  let letGo = false
  while (sim.time < hold + 6) {
    letGo ||= sim.time >= hold || sim.abilities.fuel <= 0
    if (letGo && isNaN(fuelUsed)) fuelUsed = TUNING.car.fuel.max - sim.abilities.fuel
    sim.step(drive({ lift: !letGo }))
    if (sim.abilities.lifting) liftTime += DT
    // The first step's probe has no colliders to hit yet.
    if (Number.isFinite(sim.telemetry.height)) peak = Math.max(peak, sim.telemetry.height)
    if (isNaN(climbAt03) && sim.time >= 0.3) climbAt03 = sim.body.linvel().y
  }
  const result = {
    peak,
    climbAt03,
    liftTime,
    fuelUsed,
    kind: sim.telemetry.landingKind,
    impact: sim.telemetry.landingSpeed,
  }
  sim.free()
  return result
}

function jetsOnPad() {
  section('Jets (flat pad)')
  const quick = liftOff(1)
  check(
    'standstill lift-off climbs',
    quick.climbAt03 > 0 && quick.peak > 1,
    `${f1(quick.climbAt03)} m/s up after 0.3 s, wheels peak ${f1(quick.peak)} m after 1 s, fuel ${f2(quick.fuelUsed)}`,
  )
  for (const hold of [0.25, 0.5, 2]) {
    const r = liftOff(hold)
    info(
      `lift held ${hold} s`,
      `wheels peak ${f1(r.peak)} m, fuel ${f2(r.fuelUsed)}, lands ${r.kind} at ${f1(r.impact)} m/s`,
    )
  }
  const full = liftOff(30)
  info(
    'lift held until the tank is empty',
    `${f1(full.liftTime)} s of lift, wheels peak ${f1(full.peak)} m, lands ${full.kind} at ${f1(full.impact)} m/s`,
  )
}

// Lift off the pad for `lift` s, roll right to `turns` turns and stop the spin there (air roll
// held, steering against it), then let go of everything: how far it turned in all and how it
// landed.
function airRollRun(turns: number, lift = 0.9) {
  const sim = createSim('pad', [0, REST, 0], 0)
  let phase: 'lift' | 'roll' | 'free' = 'lift'
  let landed = false
  let landings = 0
  let turned = 0
  while (sim.time < 8 && !landed) {
    const t = sim.telemetry
    if (phase === 'lift' && sim.time >= lift) phase = 'roll'
    const { forward } = pose(sim)
    const w = sim.body.angvel()
    const spin = (w.x * forward.x + w.y * forward.y + w.z * forward.z) / (Math.PI * 2) // turns/s
    const error = turns - t.rollTurns
    if (phase === 'roll' && Math.abs(error) < 0.05 && Math.abs(spin) < 0.15) phase = 'free'
    const steer = clamp1(error * 12 - spin * 2.5)
    sim.step(
      drive(phase === 'lift' ? { lift: true } : phase === 'roll' ? { airRoll: true, steer } : {}),
    )
    if (!sim.telemetry.touching) turned = sim.telemetry.rollTurns
    if (phase !== 'lift' && sim.telemetry.landings !== landings) landed = true
    landings = sim.telemetry.landings
  }
  // Let it settle.
  for (let i = 0; i < 120; i++) sim.step(released())
  const result = {
    turned,
    kind: sim.telemetry.landingKind,
    speed: sim.telemetry.landingSpeed,
    upright: pose(sim).up.y,
  }
  sim.free()
  return result
}

function airRoll() {
  section('Air roll (flat pad)')
  const full = airRollRun(0.75)
  check(
    'roll ¾ turn and let go: ends a full turn',
    full.kind !== 'bad' && Math.abs(Math.abs(full.turned) - 1) < 0.15 && full.upright > 0.95,
    `${f2(full.turned)} turns, ${full.kind} landing at ${f1(full.speed)} m/s, up ${f2(full.upright)}`,
  )
  const back = airRollRun(0.25)
  check(
    'roll ¼ turn and let go: rolls back upright',
    back.kind !== 'bad' && Math.abs(back.turned) < 0.15 && back.upright > 0.95,
    `${f2(back.turned)} turns, ${back.kind} landing at ${f1(back.speed)} m/s, up ${f2(back.upright)}`,
  )
  // Rolled upside down and let go: levelling doesn't turn it back over; the Beginner assist
  // rolls it upright near the ground.
  const flat = airRollRun(0.5, 1.4)
  const line = `${f2(flat.turned)} turns, ${flat.kind} landing at ${f1(flat.speed)} m/s, up ${f2(flat.upright)}`
  if (mode === 'pro')
    check('rolled inverted and let go: lands on the roof', flat.kind === 'bad', line)
  else check('rolled inverted and let go: assist rights it', flat.upright > 0.95, line)
}

// ---------------------------------------------------------------- the Proving Ground

const WEST = -Math.PI / 2
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

// Steers towards (x, z) and holds about `speed` m/s, slower in sharp turns.
function pursue(sim: Sim, x: number, z: number, speed: number): CarControls {
  const { p, forward, flatSpeed } = pose(sim)
  const error = angleDelta(Math.atan2(forward.x, forward.z), Math.atan2(x - p.x, z - p.z))
  const target = Math.abs(error) > 0.6 ? speed / 2 : speed
  return drive({
    steer: clamp1(-error * 2),
    throttle: flatSpeed < target ? 1 : flatSpeed > target + 3 ? -0.3 : 0,
  })
}

// Rides the half-loop as a player would: a 25 m/s run-up (boosting to hold it), throttle and
// fans up the ramp and over the inverted top, then the drop off the lip flown as in dropDriver.
// Returns undefined once it has landed.
function loopPilot(loop: Level['loops'][number], speed = 25) {
  let phase: 'approach' | 'ramp' | 'drop' = 'approach'
  let landings = 0
  return (sim: Sim): CarControls | undefined => {
    const { p, flatSpeed } = pose(sim)
    const t = sim.telemetry
    if (phase === 'approach' && p.y > 1.5) phase = 'ramp'
    if (phase === 'ramp' && !t.touching) {
      phase = 'drop'
      landings = t.landings
    }
    if (phase === 'drop' && t.landings !== landings) return undefined
    if (phase === 'approach') {
      const c = pursue(sim, loop.start[0], loop.start[2] - 10, speed)
      return { ...c, boost: flatSpeed < speed - 1 }
    }
    return phase === 'ramp' ? drive({ throttle: 1, fans: true }) : dropDriver(sim)
  }
}

// Drives the ring course in order: lines up on each ring's axis from 12 m out, then aims
// through it to 10 m beyond. The gate under the half-loop's top is ridden with loopPilot and
// the ring above the fleet flown with the kickflip from a 20 m/s run-up.
function ringCourse(level: Level) {
  const { spawn, rings } = level
  const loop = level.loops[0]
  const span = fleetSpan(level)
  const sim = createSim(level, [spawn.position[0], REST, spawn.position[2]], spawn.yaw)
  let next = 0
  let lined = false
  let fell = false
  let stunt: ((sim: Sim) => CarControls | undefined) | undefined
  let stuntFor = -1
  while (sim.time < 200 && next < rings.length) {
    const { center, yaw } = rings[next]
    const inLoop = loop && Math.abs(center[0] - loop.start[0]) < 3 && center[1] > 5
    const overFleet = Math.abs(center[0] - span.x) < 3 && center[2] < span.tail && center[1] > 4
    if ((inLoop || overFleet) && stuntFor !== next) {
      stuntFor = next
      if (inLoop) stunt = loopPilot(loop)
      else {
        const jump = jumpPilot(span, 20, { rollHeight: 3 })
        let landings = sim.telemetry.landings
        let flying = false
        stunt = (s) => {
          flying ||= !s.telemetry.touching
          if (flying && s.telemetry.landings !== landings) return undefined
          landings = s.telemetry.landings
          return jump(s)
        }
      }
    }
    const dx = Math.sin(yaw)
    const dz = Math.cos(yaw)
    const p = sim.body.translation()
    const entry = [center[0] - dx * 12, center[2] - dz * 12]
    if (!lined && Math.hypot(entry[0] - p.x, entry[1] - p.z) < 6) lined = true
    const [tx, tz] = lined ? [center[0] + dx * 10, center[2] + dz * 10] : entry
    const flown = stunt?.(sim)
    if (stunt && !flown) stunt = undefined
    sim.step(flown ?? pursue(sim, tx, tz, 20))
    if (sim.world.intersectionPair(sim.collider, sim.rings[next])) {
      next++
      lined = false
    }
    // A stunt that ended without its ring is a miss.
    if (stuntFor === next && !stunt && !flown) break
    if (sim.body.translation().y < TUNING.world.killY) fell = true
    if (fell) break
  }
  const result = {
    done: next === rings.length,
    next,
    time: sim.time,
    fell,
    hits: sim.telemetry.hits,
  }
  sim.free()
  return result
}

// Inside the perimeter walls, above the kill height.
const insidePad = (p: { x: number; y: number; z: number }) =>
  p.y > TUNING.world.killY && Math.abs(p.x) < 110 && p.z > -340 && p.z < 40

// ---------------------------------------------------------------- the fleet jump

// The row's extent along its (north) heading, from its colliders.
function fleetSpan(level: Level) {
  const boxes = level.fleet.flatMap((car) => car.boxes)
  const semi = level.fleet[level.fleet.length - 1]
  return {
    x: level.fleet[0].position[0],
    tail: Math.max(...boxes.map((b) => b.center[2] + b.size[2] / 2)), // sedan's tail
    nose: Math.min(...boxes.map((b) => b.center[2] - b.size[2] / 2)), // semi's nose
    semiTail: Math.max(...semi.boxes.map((b) => b.center[2] + b.size[2] / 2)),
    semiTop: Math.max(...semi.boxes.map((b) => b.center[1] + b.size[1] / 2)),
  }
}

type JumpStart = 'standing' | number

type JumpOptions = { rollHeight?: number; rollAfter?: number; liftAt?: number }

// The kickflip over the fleet as a player flies it: lift off (from rest just behind the row,
// or from a run-up at `start` m/s, lifting `liftAt` m before the sedan's tail), let go of lift
// and roll one full turn once the wheels are `rollHeight` m up or after `rollAfter` s of lift,
// then brake the fall with lift.
function jumpPilot(
  span: ReturnType<typeof fleetSpan>,
  start: JumpStart,
  { rollHeight = Infinity, rollAfter = Infinity, liftAt = 12 }: JumpOptions = {},
) {
  const half = chassis.halfExtents[2]
  let phase: 'approach' | 'lift' | 'roll' | 'brake' = start === 'standing' ? 'lift' : 'approach'
  let liftStart = NaN
  return (sim: Sim): CarControls => {
    const { p, forward } = pose(sim)
    const t = sim.telemetry
    const w = sim.body.angvel()
    const spin = (w.x * forward.x + w.y * forward.y + w.z * forward.z) / (Math.PI * 2)
    if (phase === 'approach' && p.z - half < span.tail + liftAt) phase = 'lift'
    if (phase === 'lift' && isNaN(liftStart)) liftStart = sim.time
    if (phase === 'lift' && (t.height > rollHeight || sim.time - liftStart >= rollAfter))
      phase = 'roll'
    if (phase === 'roll' && Math.abs(1 - t.rollTurns) < 0.05 && Math.abs(spin) < 0.3)
      phase = 'brake'
    if (phase === 'approach') return pursue(sim, span.x, span.nose - 50, start as number)
    if (phase === 'lift') return drive({ lift: true })
    if (phase === 'roll')
      return drive({ airRoll: true, steer: clamp1((1 - t.rollTurns) * 12 - spin * 2.5) })
    return cushion(sim)
  }
}

// Flies the kickflip and reports hits, the height over the semi and the first landing.
function fleetJumpRun(level: Level, start: JumpStart, options: JumpOptions = {}) {
  const span = fleetSpan(level)
  const half = chassis.halfExtents[2]
  const standing = start === 'standing'
  const z0 = standing ? span.tail + 1 + half : span.tail + 60
  const sim = createSim(level, [span.x, REST, z0], NORTH, standing ? 0 : start)
  // Settle on the springs first, as a parked car would be.
  if (standing) for (let i = 0; i < 60; i++) sim.step(drive({ handbrake: true }))
  const pilot = jumpPilot(span, start, options)
  let landings = 0
  let landing: { kind: string; speed: number; z: number; turns: number } | undefined
  let minOverSemi = Infinity // lowest chassis centre while over the semi
  let liftTime = 0
  let fuelAtLanding = NaN
  let airborne = false
  while (sim.time < 13 && !landing) {
    const { p } = pose(sim)
    sim.step(pilot(sim))
    if (sim.abilities.lifting) liftTime += DT
    airborne ||= !sim.telemetry.touching
    if (p.z < span.semiTail && p.z > span.nose) minOverSemi = Math.min(minOverSemi, p.y)
    if (airborne && sim.telemetry.landings !== landings) {
      landing = {
        kind: sim.telemetry.landingKind,
        speed: sim.telemetry.landingSpeed,
        z: sim.body.translation().z,
        turns: sim.telemetry.rollTurns,
      }
      fuelAtLanding = sim.abilities.fuel
    }
    landings = sim.telemetry.landings
  }
  // Let it settle.
  for (let i = 0; i < 120; i++) sim.step(drive({ throttle: -0.3 }))
  const result = {
    hits: sim.telemetry.hits,
    landing,
    beyond: landing !== undefined && landing.z + half < span.nose,
    upright: pose(sim).up.y,
    overSemi: minOverSemi - span.semiTop,
    liftTime,
    fuelAtLanding,
    rings: [...sim.ringsHit],
  }
  sim.free()
  return result
}

const clears = (r: ReturnType<typeof fleetJumpRun>) =>
  r.hits === 0 &&
  r.beyond &&
  r.landing!.kind !== 'bad' &&
  Math.abs(Math.abs(r.landing!.turns) - 1) < 0.15 &&
  r.upright > 0.95

// Hop `hopAt` m before the sedan's tail at `speed` m/s (boosting to hold it) and glide until
// landing: hits on the way and whether it came down beyond the row.
function hopGlideRun(level: Level, speed: number, hopAt: number) {
  const span = fleetSpan(level)
  const half = chassis.halfExtents[2]
  const sim = createSim(level, [span.x, REST, span.tail + 60], NORTH, speed)
  let hopped = false
  let landed = false
  let landings = 0
  while (sim.time < 10 && !landed) {
    const { p, flatSpeed } = pose(sim)
    const hopNow: boolean = !hopped && p.z - half < span.tail + hopAt
    hopped ||= hopNow
    const c = pursue(sim, span.x, span.nose - 50, speed)
    sim.step({ ...c, boost: flatSpeed < speed - 1, hopPressed: hopNow, hop: hopped })
    if (hopped && sim.telemetry.landings !== landings) landed = true
    landings = sim.telemetry.landings
  }
  const result = { hits: sim.telemetry.hits, beyond: sim.body.translation().z + half < span.nose }
  sim.free()
  return result
}

// Brakes the fall with lift only as much as it needs to touch down at a few m/s.
function cushion(sim: Sim): CarControls {
  const down = -sim.body.linvel().y
  const brake = 0.5 * (TUNING.car.jets.liftG - 1) * -TUNING.world.gravity[1]
  return drive({ lift: down > Math.sqrt(2 * brake * Math.max(sim.telemetry.height, 0)) + 2 })
}

const jumpLine = (r: ReturnType<typeof fleetJumpRun>) =>
  `${r.hits} hits, ${r.landing ? `${r.landing.kind} at ${f1(r.landing.speed)} m/s, ${f2(r.landing.turns)} turns` : 'no landing'}, ` +
  `over semi ${Number.isFinite(r.overSemi) ? `${f1(r.overSemi)} m` : '—'}, lift ${f1(r.liftTime)} s, fuel left ${f2(r.fuelAtLanding)}`

function fleet(level: Level) {
  section('Proving Ground: fleet')
  const span = fleetSpan(level)
  // Driving into the back of the row bounces off the first car, and counts a hit.
  for (const v of [20, 30]) {
    const sim = createSim(level, [span.x, REST, span.tail + 40], NORTH, v)
    let minZ = Infinity
    let minUp = 1
    while (sim.time < 5) {
      sim.step(drive({ throttle: 1 }))
      minZ = Math.min(minZ, sim.body.translation().z)
      minUp = Math.min(minUp, pose(sim).up.y)
    }
    const end = sim.body.translation()
    check(
      `drive into the fleet at ${v} m/s: bounces off`,
      minZ > span.tail - 1 && insidePad(end) && sim.telemetry.hits >= 1,
      `nose reaches z ${f1(minZ - chassis.halfExtents[2])} (sedan tail ${f1(span.tail)}), ${sim.telemetry.hits} hits, min up ${f2(minUp)}`,
    )
    sim.free()
  }

  // The kickflip: lift + one roll clears the row and lands upright beyond it. From rest the
  // car lifts for 1.6 s before rolling; it should take most of a tank, but not all of it.
  const rest = fleetJumpRun(level, 'standing', { rollAfter: 1.6 })
  check(
    'fleet jump from rest: clears with a roll',
    clears(rest) && rest.fuelAtLanding > 0.1 && rest.fuelAtLanding < 0.45,
    jumpLine(rest),
  )
  const run = fleetJumpRun(level, 20, { rollHeight: 3 })
  check('fleet jump from 20 m/s: clears with a roll', clears(run), jumpLine(run))
  // Cutting the lift short clips the semi, the tallest and last.
  const short = fleetJumpRun(level, 'standing', { rollAfter: 1.2 })
  check('fleet jump from rest, 1.2 s of lift: hits', short.hits > 0, jumpLine(short))

  // Hop + glide can't get over the semi: no speed or take-off point clears the row untouched.
  const glides: string[] = []
  for (const v of [20, 30, 45]) {
    for (const hopAt of [0, 5, 10]) {
      const r = hopGlideRun(level, v, hopAt)
      glides.push(`${v}/${hopAt}:${r.hits === 0 && r.beyond ? 'CLEARS' : r.hits}`)
    }
  }
  check(
    'fleet: hop + glide never clears untouched',
    !glides.some((g) => g.endsWith('CLEARS')),
    `hits by speed/hop m before the row: ${glides.join(' ')}`,
  )
}

function provingGround() {
  const level = PROVING_GROUND
  section('Proving Ground')
  const course = ringCourse(level)
  check(
    'ring course completes in order, both stunts',
    course.done && !course.fell && course.hits === 0,
    `${course.next}/${level.rings.length} rings, ${f1(course.time)} s, ${course.hits} fleet hits`,
  )

  halfLoop(level)
  lipDrop(level)

  fleet(level)

  // The perimeter wall holds a boosted car.
  const sim = createSim(level, [0, REST, -150], WEST, 45)
  let minX = Infinity
  while (sim.time < 6) {
    sim.step(drive({ throttle: 1, boost: true }))
    minX = Math.min(minX, sim.body.translation().x)
  }
  check(
    'west wall at 45 m/s + boost: holds',
    minX > -110 && insidePad(sim.body.translation()),
    `min x ${f1(minX)}`,
  )
  sim.free()
}

// Half-loop runs: hold `speed` to the foot of the loop (boosting on the run-up if asked), then
// hand over to `onRamp` once the car is on it.
type LoopRun = {
  speed: number
  boost?: boolean
  fans: boolean // false: automatic fans off too
  onRamp: (sim: Sim) => CarControls
}

function loopRun(level: Level, { speed, boost, fans, onRamp }: LoopRun) {
  const loop = level.loops[0]
  const at: Vec3 = [loop.start[0], REST, loop.start[2] + 30]
  const sim = createSim(level, at, NORTH, speed, fans ? {} : { autoFans: 0 })
  let peak = 0
  let arrival = 0
  let ramp = false
  let runUpMinUp = 1
  let minUp = 1
  // Rode the inverted top on its wheels: in contact with a ceiling past ~160°.
  let overTop = false
  let topSpeed = NaN
  while (sim.time < 14) {
    const s = pose(sim)
    if (s.p.y > 1.5 && !ramp) {
      arrival = s.speed
      ramp = true
    }
    if (!ramp) runUpMinUp = Math.min(runUpMinUp, s.up.y)
    const c = ramp
      ? onRamp(sim)
      : drive({ throttle: s.flatSpeed < speed ? 1 : 0, boost: !!boost && s.flatSpeed < speed })
    sim.step(c)
    const after = pose(sim)
    peak = Math.max(peak, after.p.y)
    minUp = Math.min(minUp, after.up.y)
    if (grounded(sim) && sim.abilities.hold === 'ceiling' && after.up.y < -0.95) {
      if (!overTop) topSpeed = after.speed
      overTop = true
    }
  }
  const end = sim.body.translation()
  // Back on the asphalt or the loop's foot, upright or not (R recovers a car on its roof), and
  // neither up on the loop nor behind it (its back is ~17 m past the entry).
  const back = insidePad(end) && end.y < 2.5 && end.z > loop.start[2] - 12
  const result = {
    sim,
    arrival,
    peak,
    runUpMinUp,
    minUp,
    overTop,
    topSpeed,
    back,
    end,
    endUp: pose(sim).up.y,
    scrapes: sim.scrapes,
    minSuspension: sim.minSuspension,
  }
  sim.free()
  return result
}

const surfaceSpeed = (sim: Sim) => {
  const { v, up } = pose(sim)
  const vel = new Vector3(v.x, v.y, v.z)
  return vel.addScaledVector(up, -vel.dot(up)).length()
}

// Fans-on driver: throttle (and boost when slow) up the ramp until upside down, stop there on
// the hold brake for `hold` s, then drive on off the lip, and hand over to `afterLip` (no
// input if not given). Pro holds the fans; Beginner leaves them to the assist.
function fansDriver(hold: number, afterLip?: (sim: Sim) => CarControls) {
  let phase: 'climb' | 'stop' | 'go' = 'climb'
  let stoppedAt = 0
  // `creep`: how far the parked car moves from half a second into the hold to its end.
  const stats = { holdTime: 0, creep: NaN, fuelAtStop: NaN, fuelAtGo: NaN, leftLip: false }
  let parked: InstanceType<typeof Vector3> | null = null
  const onRamp = (sim: Sim): CarControls => {
    const { up } = pose(sim)
    const on = grounded(sim)
    const fans = mode === 'pro'
    if (phase === 'climb' && on && up.y < -0.8) {
      phase = 'stop'
      stoppedAt = sim.time
      stats.fuelAtStop = sim.abilities.fuel
    }
    if (phase === 'stop') {
      const ceiling = on && sim.abilities.hold === 'ceiling'
      if (ceiling && surfaceSpeed(sim) < 0.5) stats.holdTime += DT
      const p = sim.body.translation()
      if (stats.holdTime > 0.5) {
        // Along the surface only: the springs settling as the fans spool isn't creep.
        parked ??= new Vector3(p.x, p.y, p.z)
        const { up } = pose(sim)
        const moved = new Vector3(p.x, p.y, p.z).sub(parked)
        stats.creep = moved.addScaledVector(up, -moved.dot(up)).length()
      }
      if (sim.time - stoppedAt > hold + 1) {
        phase = 'go'
        stats.fuelAtGo = sim.abilities.fuel
      }
      // Brake to a stop; once slow, the fans' hold brake parks it.
      return drive({ throttle: surfaceSpeed(sim) > 2 ? -1 : 0, fans })
    }
    if (phase === 'go') {
      if (!on && up.y < -0.5) stats.leftLip = true
      if (!stats.leftLip) return drive({ throttle: 1, fans })
      return afterLip ? afterLip(sim) : released()
    }
    // Past vertical, brake down to a crawl so it stops before the lip.
    const speed = surfaceSpeed(sim)
    if (up.y < 0 && speed > 4) return drive({ throttle: -1, fans })
    return drive({ throttle: 1, boost: speed < 6, fans })
  }
  return { onRamp, stats }
}

// After the lip: roll upright (short way round), then brake the fall with lift, so the car is
// still slowing as it touches down.
function dropDriver(sim: Sim): CarControls {
  const { up, v } = pose(sim)
  const left = new Vector3(1, 0, 0).applyQuaternion(q)
  const roll = Math.atan2(left.y, up.y)
  if (up.y < 0.6) return drive({ airRoll: true, steer: roll > 0 ? -1 : 1 })
  const { height } = sim.telemetry
  const down = -v.y
  const { liftG } = TUNING.car.jets
  const brake = 0.5 * (liftG - 1) * -TUNING.world.gravity[1] // a cautious net deceleration
  const lift = down > Math.sqrt(2 * brake * Math.max(height, 0)) + 1 || (height < 1.5 && down > 0.5)
  return drive({ lift })
}

// Climb with the fans, hold under the top for 2 s, drive off the lip and either fly the drop
// (roll and lift) or do nothing; reports the first landing after the lip.
function dropRun(level: Level, speed: number, fly: boolean) {
  const drop = {
    fuelAtLip: NaN,
    landed: false,
    kind: '—' as string,
    speed: NaN,
    turns: NaN,
    fuelAtLanding: NaN,
  }
  let landings = 0
  const afterLip = (sim: Sim) => {
    const t = sim.telemetry
    if (isNaN(drop.fuelAtLip)) {
      drop.fuelAtLip = sim.abilities.fuel
      landings = t.landings
    }
    if (!drop.landed && t.landings !== landings) {
      Object.assign(drop, {
        landed: true,
        kind: t.landingKind,
        speed: t.landingSpeed,
        turns: t.rollTurns,
        fuelAtLanding: sim.abilities.fuel,
      })
    }
    return fly && !drop.landed ? dropDriver(sim) : released()
  }
  const driver = fansDriver(2, afterLip)
  const r = loopRun(level, { speed, fans: true, onRamp: driver.onRamp })
  return { ...r, ...drop, held: driver.stats.holdTime }
}

function lipDrop(level: Level) {
  // From 20 m/s the car parks short of the top and crawls to the lip under the fans, which
  // leaves too little fuel for the jets; the shared tank is the limit (see ROADMAP notes).
  for (const v of [20, 22, 25]) {
    const r = dropRun(level, v, true)
    const ok =
      r.landed && r.kind === 'clean' && r.speed < TUNING.car.landing.badImpact && r.endUp > 0.9
    const line = `held ${f1(r.held)} s, fuel ${f2(r.fuelAtLip)} at the lip, ${f2(r.fuelAtLanding)} at landing, ${r.kind} at ${f1(r.speed)} m/s, ${f2(Math.abs(r.turns))} turns, ends ${r.endUp > 0.9 ? 'upright' : 'not upright'} y ${f1(r.end.y)} z ${f1(r.end.z)}`
    if (v === 20) info(`drop from ${v} m/s: roll + lift`, line)
    else check(`drop from ${v} m/s: roll + lift, clean landing`, ok, line)
  }
  const idle = dropRun(level, 25, false)
  const line = `${idle.kind} landing at ${f1(idle.speed)} m/s, ${f2(Math.abs(idle.turns))} turns, ends ${idle.endUp > 0.9 ? 'upright' : idle.endUp < 0 ? 'on its roof' : 'on its side'}`
  if (mode === 'pro') {
    check('drop doing nothing: lands on the roof', idle.kind === 'bad' && idle.endUp < 0, line)
  } else info('drop doing nothing (auto-right)', line)
}

function halfLoop(level: Level) {
  const loop = level.loops[0]
  const { minRadius } = loopProfile(loop)
  const g = -TUNING.world.gravity[1]
  info(
    'half-loop',
    `${loop.height} m tall, radius ${f1(minRadius)} m after the entry, loop speed √(g·r) ${f1(Math.sqrt(g * minRadius))} m/s`,
  )

  // Without fans: hold a speed to the foot, lift off the throttle once on the ramp, and see
  // how high it gets before sliding back or dropping off. The suspension should keep the
  // chassis off the ramp at any speed up to 35 m/s.
  const coast = () => released()
  const runs: [number, boolean][] = [
    [12, false],
    [16, false],
    [20, false],
    [25, false],
    [30, false],
    [35, true],
    [45, true],
  ]
  for (const [v, boost] of runs) {
    const r = loopRun(level, { speed: v, boost, fans: false, onRamp: coast })
    check(
      `no fans, ${v} m/s${boost ? ' + boost' : ''}: ends back on the pad`,
      r.back && r.runUpMinUp > 0.9 && (v > 35 || r.scrapes === 0),
      `arrives ${f1(r.arrival)} m/s, peak ${f1(r.peak)} m, ${r.overTop ? 'over the top' : 'falls off'}, ${r.minUp < 0 ? 'turned over' : 'upright'}, ends ${r.endUp < 0 ? 'on its roof' : 'upright'}, chassis contact ${r.scrapes} steps, min susp ${f2(r.minSuspension)} m, ends y ${f1(r.end.y)} z ${f1(r.end.z)}`,
    )
  }
  // The slowest arrival that rides over the inverted top without fans.
  let fansOff = NaN
  for (let v = 14; v <= 40; v++) {
    const r = loopRun(level, { speed: v, boost: v > 30, fans: false, onRamp: coast })
    if (r.overTop) {
      fansOff = r.arrival
      info(
        'no fans: slowest over the top',
        `arrives ${f1(r.arrival)} m/s, ${f1(r.topSpeed)} m/s at the top`,
      )
      break
    }
  }

  // With fans: from the slowest approach that still makes it, climb, hold inverted for 3 s
  // and drive on off the lip.
  let slowest: (ReturnType<typeof loopRun> & ReturnType<typeof fansDriver>['stats']) | null = null
  for (let v = 10; v <= 30 && !slowest; v++) {
    const driver = fansDriver(3)
    const r = loopRun(level, { speed: v, fans: true, onRamp: driver.onRamp })
    const s = driver.stats
    if (s.holdTime >= 3 && s.leftLip && r.back) slowest = { ...r, ...s }
  }
  check(
    'fans: climbs slowly, holds inverted 3 s, drives off',
    !!slowest && slowest.arrival < fansOff - 5,
    slowest
      ? `from ${f1(slowest.arrival)} m/s (no fans needs ${f1(fansOff)}), held ${f1(slowest.holdTime)} s (creep ${f2(slowest.creep)} m), fuel ${f2(slowest.fuelAtStop)} at the stop, ${f2(slowest.fuelAtGo)} after, ends y ${f1(slowest.end.y)} z ${f1(slowest.end.z)}`
      : 'never held',
  )
  for (const v of [20, 25]) {
    const driver = fansDriver(3)
    const r = loopRun(level, { speed: v, fans: true, onRamp: driver.onRamp })
    const s = driver.stats
    check(
      `fans from ${v} m/s: holds inverted 3 s, drives off`,
      s.holdTime >= 3 && s.creep < 0.1 && s.leftLip && r.back && r.runUpMinUp > 0.9,
      `held ${f1(s.holdTime)} s (creep ${f2(s.creep)} m), fuel ${f2(s.fuelAtStop)} → ${f2(s.fuelAtGo)}, chassis contact ${r.scrapes} steps, ends y ${f1(r.end.y)} z ${f1(r.end.z)}`,
    )
  }
}

// Positional arguments pick assist modes and/or levels; none means all of them.
const LEVEL_IDS = [TEST_LEVEL.id, PROVING_GROUND.id]
const args = process.argv.slice(2)
const unknown = args.filter((a) => !(a in TUNING.assists) && !LEVEL_IDS.includes(a))
if (unknown.length) {
  console.error(
    `Unknown argument(s): ${unknown.join(', ')}. Use assist modes and/or ${LEVEL_IDS.join(', ')}.`,
  )
  process.exit(2)
}
const pick = <T extends string>(all: T[]) => {
  const chosen = all.filter((x) => args.includes(x))
  return chosen.length ? chosen : all
}
const modes = pick(Object.keys(TUNING.assists) as AssistMode[])
const levels = pick(LEVEL_IDS)

for (const m of modes) {
  mode = m
  rows.push('', `######## Assists: ${m}`)
  // Pad driving and the test level.
  if (levels.includes(TEST_LEVEL.id)) {
    straightLine()
    skidpad()
    stepSteer()
    slalom()
    handbrakeDrift()
    jumps()
    rings()
    hopTiming()
    jetsOnPad()
    airRoll()
  }
  if (levels.includes(PROVING_GROUND.id)) provingGround()
}

console.log(`Rest height ${REST.toFixed(3)} m (fans held ${measureRestHeight(true).toFixed(3)} m)`)
console.log(rows.join('\n'))
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exitCode = failures === 0 ? 0 : 1
