// All gameplay and physics values live here. Components import from this file
// instead of hard-coding numbers, so the game can be tuned in one place.
// The debug panel (src/ui/TuningPanel.tsx) edits these objects in place at runtime, so
// read values when they're used (or keep a reference to their section object); never
// copy a number out at module load.
type Vec3 = [number, number, number]

export const TUNING = {
  world: {
    gravity: [0, -9.81, 0] as Vec3,
    killY: -15, // m, falling below this respawns the car at its last safe point
  },
  car: {
    // Car-local axes: +Z is forward (Rapier's vehicle forward axis), +Y up, +X left.
    spawn: {
      position: [0, 1.5, 0] as Vec3,
      yaw: Math.PI, // face away from the default camera
    },
    chassis: {
      halfExtents: [0.9, 0.3, 2.1] as Vec3,
      mass: 150,
    },
    wheels: {
      radius: 0.33,
      width: 0.36,
      // Chassis-local suspension mount points: front-left, front-right, rear-left, rear-right.
      positions: [
        [0.74, -0.17, 1.3],
        [-0.74, -0.17, 1.3],
        [0.74, -0.17, -1.3],
        [-0.74, -0.17, -1.3],
      ] as Vec3[],
    },
    suspension: {
      restLength: 0.4,
      maxTravel: 0.3,
      stiffness: 30,
      compression: 4.4,
      relaxation: 2.3,
      maxForce: 100000,
    },
    tires: {
      frictionSlip: 2.5,
      sideFrictionStiffness: 1,
    },
    engine: {
      force: 400, // per driven (rear) wheel
      reverseForce: 250,
      maxSpeed: 30, // m/s, engine cuts out above this
      maxReverseSpeed: 8,
    },
    brake: {
      force: 10,
      handbrakeForce: 20, // rear wheels only
      idleBrake: 0.5, // applied when neither throttle nor brake is held
    },
    steering: {
      maxAngle: 0.5, // rad
      speed: 2.5, // rad/s the wheels turn towards the target angle
    },
    // Below this speed (m/s) S starts reversing instead of braking, and W the other way round.
    stopSpeed: 0.5,
    // Ability values are per unit of mass (m/s, m/s²), so they survive chassis mass changes.
    fuel: {
      max: 1, // a full tank
      rechargePerSecond: 0.25, // while grounded and not boosting
    },
    boost: {
      acceleration: 12, // m/s² of thrust along the car's forward axis
      maxSpeed: 45, // m/s forward, thrust cuts out above this
      fuelPerSecond: 0.35,
    },
    hop: {
      velocity: 6, // m/s added along the car's up axis
    },
    glide: {
      gravityScale: 0.25, // fraction of world gravity while gliding
      maxFallSpeed: 3, // m/s, faster falls are damped towards this
      fallDamping: 3, // 1/s
      headingAlign: 1.5, // 1/s, how quickly horizontal velocity turns to follow the car's heading
      fuelPerSecond: 0.25,
    },
    // Light air control while gliding: pitch (W/S, stick Y) tilts the nose, steer yaws and banks
    // into the turn; analog input scales the angles and rates.
    // Pitch and roll hold an angle and level out on release, so the car can't be flipped.
    airControl: {
      pitchAngle: 0.4, // rad nose down (W) or up (S)
      bankAngle: 0.4, // rad of roll while yawing
      levelRate: 3, // 1/s, how quickly pitch and roll follow their target angle
      yawRate: 1.5, // rad/s
      damping: 4, // 1/s, how quickly spin follows the input
    },
    // Respawn point after a fall or R: the last pose that was upright, on all four
    // wheels and away from edges for a moment. Falls back to spawn until one is recorded.
    respawn: {
      minSafeTime: 0.5, // s a pose must stay safe before it's recorded (skips landing bounces)
      minUpright: 0.97, // car up-axis Y at least this (≈ 14° tilt)
      edgeMargin: 4, // m of level ground needed ahead, behind and to each side
      flatTolerance: 0.4, // m the ground under each edge probe may differ from under the car
      lift: 0.3, // m above the recorded pose to respawn at
    },
  },
  input: {
    stickDeadzone: 0.15, // stick tilt (0–1) ignored around the centre
    triggerDeadzone: 0.05, // trigger travel (0–1) ignored at rest
    buttonThreshold: 0.5, // a gamepad button counts as down above this value
  },
  race: {
    countdown: 3, // s from restart to go; the car is held until then
    ringDepth: 1, // m, thickness of a ring's sensor along its axis (read at mount)
  },
  camera: {
    chase: {
      distance: 7, // m behind the car at rest
      height: 2.5, // m above the car
      lookHeight: 1, // m above the car the camera aims at
      lookAhead: 3, // m ahead of the car the camera aims at
      speedDistance: 0.1, // extra m of distance per m/s of speed
      maxExtraDistance: 3, // cap on the speed-based extra distance
      // Damping rates (1/s): higher follows more tightly, lower lags more.
      positionDamping: 6,
      headingDamping: 4,
      lookDamping: 10,
      minHeight: 0.5, // m above the surface below the camera
      obstructionMargin: 0.3, // m the camera stays in front of a wall between it and the car
      snapDistance: 10, // m the car moves in one frame (reset/respawn) that snaps the camera
      fov: 50, // vertical field of view (degrees)
      boostFov: 12, // extra degrees while boosting
      fovDamping: 3,
      // Shake: landings add trauma (0–1), which decays; the offset grows with trauma².
      landingShake: 0.7, // trauma added by a full-strength landing
      boostShake: 0.15, // trauma held while boosting
      shakeDecay: 2.5, // trauma lost per second
      shakeOffset: 0.3, // m of camera and aim offset at full trauma
    },
  },
  // Visual effects driven by the car's state (src/vfx, src/scene/Effects.tsx).
  vfx: {
    landing: {
      minAirTime: 0.25, // s airborne before touching down counts as a landing
      minImpactSpeed: 2, // m/s fall speed of the weakest landing that kicks up dust
      fullImpactSpeed: 10, // m/s fall speed of a full-strength landing
    },
    skid: {
      minSlipSpeed: 2.5, // m/s sideways slide at a wheel where marks start
      fullSlipSpeed: 7, // m/s sideways slide for the darkest marks
      handbrakeMinSpeed: 4, // m/s a locked rear wheel leaves marks above
    },
    flame: {
      length: 1.4, // m at full boost
      glideLevel: 0.55, // flame size while only gliding, as a fraction of boost
      attack: 18, // 1/s, how quickly the flame lights
      release: 8, // 1/s, how quickly it dies down
    },
    post: {
      bloomIntensity: 1.2,
      bloomThreshold: 1, // luminance above which pixels bloom (only HDR emissives pass)
      blurStartSpeed: 20, // m/s where the speed blur begins
      blurFullSpeed: 45, // m/s where it reaches full strength
      blurStrength: 1, // at full speed; boosting adds half again
      vignette: 0.45, // darkness
    },
  },
}
