// Headless handling sim: runs the car's own per-step code (src/car) in Rapier on a flat test
// pad and on the test level, and prints driving, jump and ring metrics, so tuning changes can
// be checked without playing. `npm run sim:car`.
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
const { TEST_LEVEL, rampVertices } = await import('../src/scene/testLevel.ts')
const { createAbilityState, stepAbilities } = await import('../src/car/abilities.ts')
const { createDrivingState, stepDriving } = await import('../src/car/handling.ts')
const { createTelemetry, stepTelemetry } = await import('../src/car/telemetry.ts')
const { released } = await import('../src/car/useCarControls.ts')
type CarControls = import('../src/car/useCarControls.ts').CarControls
type Vec3 = [number, number, number]
type AssistMode = keyof typeof TUNING.assists

await RAPIER.init()

const DT = 1 / 60
const { chassis, wheels, suspension } = TUNING.car
const NORTH = Math.PI
const SOUTH = 0

// ---------------------------------------------------------------- worlds

type Ground = 'pad' | 'level'

function createWorld(ground: Ground) {
  const world = new RAPIER.World({ x: 0, y: TUNING.world.gravity[1], z: 0 })
  world.timestep = DT
  const rings: InstanceType<typeof RAPIER.Collider>[] = []
  if (ground === 'pad') {
    world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 1, 2000).setTranslation(0, -1, 0))
    return { world, rings }
  }
  const level = TEST_LEVEL
  for (const { center, size } of [...level.ground, ...level.platforms, ...level.walls]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...center),
    )
  }
  for (const ramp of level.ramps) {
    const points = new Float32Array(rampVertices(ramp).flat())
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ramp.yaw)
    world.createCollider(
      RAPIER.ColliderDesc.convexHull(points)!
        .setTranslation(...ramp.start)
        .setRotation(yaw),
    )
  }
  // As Race.tsx: an upright cylinder sensor turned to face along the ring's yaw.
  for (const { center, yaw, radius } of level.rings) {
    const q = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), yaw)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2))
    rings.push(
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(TUNING.race.ringDepth / 2, radius)
          .setSensor(true)
          .setTranslation(...center)
          .setRotation(q),
      ),
    )
  }
  return { world, rings }
}

// ---------------------------------------------------------------- the car

type Sim = ReturnType<typeof createSim>

// Assist mode for the cars created; each run of the checks sets it.
let mode: AssistMode = 'beginner'

// The car as Car.tsx sets it up, stepped in the same order as its useBeforePhysicsStep.
function createSim(ground: Ground, position: Vec3, yaw: number, speed = 0) {
  const { world, rings } = createWorld(ground)
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
  const assist = TUNING.assists[mode]
  const probe = {
    world,
    ray: new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
    flags: RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
  }
  const sim = {
    world,
    body,
    vc,
    driving,
    abilities,
    telemetry,
    ringsHit,
    time: 0,
    step(c: CarControls) {
      stepDriving(driving, body, vc, c, DT, assist)
      vc.updateVehicle(DT, probe.flags)
      stepAbilities(abilities, body, vc, c, DT, assist, probe)
      stepTelemetry(telemetry, body, vc, c, DT)
      world.step()
      sim.time += DT
      rings.forEach((ring, i) => {
        if (world.intersectionPair(collider, ring)) ringsHit.add(i)
      })
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
const grounded = (sim: Sim) => sim.telemetry.grounded

// Rest height of the chassis centre above flat ground.
function measureRestHeight() {
  const sim = createSim('pad', [0, 2, 0], 0)
  for (let i = 0; i < 300; i++) sim.step({ ...released(), handbrake: true })
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
  time?: number
}

// Drives on full throttle, optionally hops and glides, and follows the car until it has
// landed and settled, or fallen out of the world.
function launch(launchOptions: Launch) {
  const { at, yaw, speed, hopAt, glide, glideUntil = Infinity, boost, probeZ } = launchOptions
  const { time = 12 } = launchOptions
  const sim = createSim('level', [at[0], at[1] + REST, at[2]], yaw, speed)
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
    sim.step(
      drive({
        throttle: 1,
        boost: !!boost,
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
      `land z ${f1(r.landing?.z ?? NaN)}, ring ${r.rings.includes(0) ? 'hit' : 'missed'}, min up ${f2(r.minUp)}, ${r.bounced ? 'bounced' : 'stuck'}`,
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
    const sim = createSim('level', [0, REST, -135], NORTH, 15)
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

const modes = (process.argv[2] ? [process.argv[2]] : Object.keys(TUNING.assists)) as AssistMode[]
for (const m of modes) {
  mode = m
  rows.push('', `######## Assists: ${m}`)
  straightLine()
  skidpad()
  stepSteer()
  slalom()
  handbrakeDrift()
  jumps()
  rings()
  hopTiming()
}

console.log(`Rest height ${REST.toFixed(3)} m`)
console.log(rows.join('\n'))
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exitCode = failures === 0 ? 0 : 1
