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
    // The spawn pose is per level (src/scene/levelData.ts).
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
    // Grip curve: a tyre holds full grip up to the peak slip angle (between where it points
    // and where it's going), then fades to slideGrip as the slide grows, so a slide keeps
    // going until it's caught and grip comes back as the angle closes.
    tires: {
      frictionSlip: 2.5, // peak grip
      sideFrictionStiffness: 1,
      peakSlipAngle: 0.14, // rad (8°)
      slideSlipAngle: 0.45, // rad (26°) where grip has fallen to slideGrip
      slideGrip: 0.75, // fraction of peak grip while sliding
      rearGrip: 1, // rear tyres' grip relative to the front (balance)
    },
    // Arcade drift: the handbrake, or the rear stepping out under throttle, starts a drift that
    // lowers rear grip until the car runs straight again; throttle holds the slide.
    drift: {
      minSpeed: 8, // m/s
      entryAngle: 0.2, // rad of rear slip under throttle that starts a drift
      exitAngle: 0.1, // rad, the drift ends after the rear slip stays below this…
      exitTime: 0.25, // …for this long (s) without the handbrake
      rearGrip: 0.7, // rear grip while drifting, as a fraction of normal…
      throttleGrip: 0.25, // …less this much more on full throttle, so throttle holds the slide
      thrust: 6, // m/s² push along the heading on full throttle, so a slide keeps its speed
      gripDropRate: 1.5, // per s, how quickly rear grip drops when a drift starts
      recoverTime: 0.5, // s for rear grip to come back after a drift
    },
    engine: {
      force: 400, // per driven (rear) wheel
      reverseForce: 250,
      maxSpeed: 32, // m/s, the force fades to nothing here (drag holds the car a little below)
      taper: 6, // force × (1 − (speed / maxSpeed)^taper): higher keeps full force longer
      maxReverseSpeed: 8,
    },
    // Grounded only, per unit of mass and speed² (1/m), so flight isn't affected.
    aero: {
      drag: 0.001, // m/s² of drag per (m/s)²
      downforce: 0.002, // m/s² pressing the car down per (m/s)²
    },
    // The vehicle controller applies tyre forces near the centre of mass, so the body hardly
    // leans. These add the lean (and the load shift onto the outside / front wheels) a centre
    // of mass this high (m) above that point would give.
    weightTransfer: {
      roll: 0.25,
      pitch: 0.1,
    },
    brake: {
      force: 10,
      handbrakeForce: 20, // rear wheels only
      idleBrake: 0.5, // applied when neither throttle nor brake is held
    },
    steering: {
      maxAngle: 0.5, // rad
      speed: 2.5, // rad/s the wheels turn towards the target angle
      returnSpeed: 4, // rad/s back towards the centre
      highSpeedFactor: 0.35, // fraction of maxAngle left at fullSpeed (not while drifting)
      fullSpeed: 35, // m/s
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
      buffer: 0.15, // s a press early before landing is kept
      coyoteTime: 0.12, // s after driving off an edge that a hop still works
      cooldown: 0.25, // s between hops
    },
    glide: {
      gravityScale: 0.25, // fraction of world gravity while gliding and falling
      riseGravityScale: 0.5, // fraction while gliding and still rising (less lift from a hop)
      maxFallSpeed: 3, // m/s, faster falls are damped towards this
      fallDamping: 3, // 1/s
      headingAlign: 1.5, // 1/s, how quickly horizontal velocity turns to follow the car's heading
      fuelPerSecond: 0.25,
    },
    // Air control: pitch (W/S, stick Y) tilts the nose, steer yaws and banks into the turn;
    // analog input scales the angles and rates. Full strength while gliding, weaker while
    // plainly airborne. Pitch and roll hold an angle and level out on release (relative to
    // the ground below once it's near), so the car can't be flipped and lands on its wheels.
    airControl: {
      pitchAngle: 0.4, // rad nose down (W) or up (S)
      bankAngle: 0.4, // rad of roll while yawing
      levelRate: 3, // 1/s, how quickly pitch and roll follow their target angle
      yawRate: 1.5, // rad/s
      damping: 4, // 1/s, how quickly spin follows the input
      plainFactor: 0.35, // angles and yaw control while airborne without gliding
      groundProbe: 6, // m, below this the car levels to the ground's slope instead of flat
    },
    // Touchdown settling: spin is damped for a moment after a landing.
    landing: {
      minAirTime: 0.25, // s airborne before a touchdown counts
      assistTime: 0.35, // s
      spinDamping: 8, // 1/s on roll and yaw spin, scaled by the assist level
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
  // Driving and flying help, per assist mode (picked on the main menu, src/state/assistStore.ts).
  assists: {
    beginner: {
      counterSteer: 0.6, // 0–1, front wheels turn towards the slide while drifting
      driftAngle: 0.6, // rad of slide a drift is held to…
      driftHold: 40, // …by damping spin that would widen it (1/s per rad past the angle)
      yawDamping: 4, // 1/s on spin beyond what the steering asks for (outside a drift)
      tractionControl: 0.8, // 0–1, engine cut when the rear slides without a drift
      airLevel: 1.5, // × airControl.levelRate
      landing: 1, // × landing.spinDamping
    },
    pro: {
      counterSteer: 0,
      driftAngle: 1,
      driftHold: 15,
      yawDamping: 0.5,
      tractionControl: 0,
      airLevel: 0.7,
      landing: 0.4,
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
      obstructionRelease: 3, // 1/s, how quickly it moves back out once the wall is gone
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
  // Synthesized sound (src/audio). Levels are linear gains before the player's volume
  // settings; how each sound is built (waveforms, envelopes) lives with it in src/audio.
  audio: {
    mix: {
      motor: 0.35,
      whine: 0.06, // thin high inverter whine on top of the motor
      thruster: 0.5,
      wind: 0.25,
      skid: 0.3,
      oneShots: 0.8, // hop, landing, boost burst, respawn
      race: 0.6, // countdown, rings, finish
      ui: 0.4,
      music: 0.5,
    },
    motor: {
      idlePitch: 70, // Hz at rest
      topPitch: 420, // Hz at topSpeed
      topSpeed: 45, // m/s
      idleLevel: 0.25, // fraction of the motor level when coasting at rest
      load: 0.6, // extra level and brightness at full throttle
    },
    wind: {
      fullSpeed: 40, // m/s where the wind reaches full level
      airborne: 1.6, // multiplier while in the air
    },
    skid: {
      minSkid: 0.25, // wheel skid (0–1) below which the tyres stay quiet
    },
    music: {
      tempo: 112, // BPM
    },
  },
}
