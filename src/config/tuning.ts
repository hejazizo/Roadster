// All gameplay and physics values live here. Components import from this file
// instead of hard-coding numbers, so the game can be tuned in one place.
type Vec3 = [number, number, number]

export const TUNING = {
  world: {
    gravity: [0, -9.81, 0] as Vec3,
  },
  car: {
    // Car-local axes: +Z is forward (Rapier's vehicle forward axis), +Y up, +X left.
    spawn: {
      position: [0, 1.5, 0] as Vec3,
      yaw: Math.PI, // face away from the default camera
    },
    chassis: {
      halfExtents: [0.9, 0.3, 2.0] as Vec3,
      mass: 150,
    },
    wheels: {
      radius: 0.4,
      width: 0.3,
      // Chassis-local suspension mount points: front-left, front-right, rear-left, rear-right.
      positions: [
        [0.85, -0.1, 1.3],
        [-0.85, -0.1, 1.3],
        [0.85, -0.1, -1.3],
        [-0.85, -0.1, -1.3],
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
    // Light air control while gliding: W/S tilt the nose, A/D yaw and bank into the turn.
    // Pitch and roll hold an angle and level out on release, so the car can't be flipped.
    airControl: {
      pitchAngle: 0.4, // rad nose down (W) or up (S)
      bankAngle: 0.4, // rad of roll while yawing
      levelRate: 3, // 1/s, how quickly pitch and roll follow their target angle
      yawRate: 1.5, // rad/s
      damping: 4, // 1/s, how quickly spin follows the input
    },
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
      minHeight: 0.5, // m, camera never goes below this (ground is y = 0)
      snapDistance: 10, // m the car moves in one frame (reset/respawn) that snaps the camera
    },
  },
} as const
