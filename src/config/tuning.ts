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
      // Bump stop: towards the end of its travel the spring and its damping stiffen, so tight
      // curves taken fast (the half-loop) don't bottom out onto the chassis.
      bumpStart: 0.6, // fraction of travel (from rest length to fully compressed) where it starts
      bumpStiffness: 4, // × stiffness and damping at full compression
      bumpDelay: 0.25, // s after a touchdown before it starts fading in (over as long again)
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
    // Underbody fans: held (or automatic on steep surfaces on Beginner), they pull the car
    // into the surface its wheels touch, just enough to keep `holdG` pressing it on: none on
    // the floor, 1 g on a wall, 2 g on a ceiling, never more than `maxG`. They don't push the
    // car along; climbing a wall slowly takes boost.
    suction: {
      maxG: 2, // g, the most the fans pull
      holdG: 1, // g of load into the surface the fans keep up
      spoolRate: 6, // 1/s, how quickly the fans spin up and down
      fuelPerSecond: 0.12, // at full suction
      holdBrake: 10, // brake with no throttle while the fans hold the car, so it parks on a wall…
      holdSpeed: 3, // m/s, …once it's slower than this
      parkStiffness: 10, // 1/s, how firmly a parked car stays where it stopped (static friction)
      autoAngle: 0.52, // rad, surfaces steeper than this engage the fans on their own (assist)…
      autoRelease: 0.35, // …until the surface is flatter than this
    },
    // Cold-gas jets: held lift pushes along the car's own up (so firing upside down pushes it
    // down) and forward. Both pushes fade with height above the ground below (or a parked car's
    // roof), so the jets lift the car off, carry it a few metres up and along, and brake a fall
    // near the ground, but can't hold it high or replace the glide over a void. Air roll (held,
    // plus steer) spins the car about its long axis.
    jets: {
      liftG: 2.7, // g along the car's up, near the ground
      forwardG: 1.2, // g along the car's forward near the ground: a standstill lift-off clears the fleet
      fuelPerSecond: 0.35,
      fullHeight: 3, // m above the ground (chassis centre) with full push…
      fadeHeight: 12, // …fading to minFactor by this height (and over a void)
      minFactor: 0,
      riseDrag: 1.5, // 1/s, slows a climb under lift (m/s² per m/s up), so it settles at a hover
      heightProbe: 50, // m, how far down the ground is looked for
      rollTorque: 30, // rad/s² of roll spin from full steer while rolling
      maxRollRate: 9, // rad/s (a full roll in about 0.9 s)
      // Air levelling holds the car near upright and lets go as it turns over (angle between
      // the car's up and the level's, rad), so it can fly inverted.
      levelCapture: 1.4,
      levelRelease: 2,
      autoRightTime: 1.4, // s to impact below which the Beginner assist rolls an inverted car
      cleanLiftWindow: 0.4, // s, a wheel landing this soon after lift is a clean one
    },
    // Touchdown settling: spin is damped for a moment after a landing.
    landing: {
      minAirTime: 0.25, // s airborne before a touchdown counts
      assistTime: 0.35, // s
      spinDamping: 8, // 1/s on roll and yaw spin, scaled by the assist level
      uprightDot: 0.5, // car up · surface normal below this at touchdown: a roof or side landing
      badImpact: 14, // m/s into the surface: a wheel landing harder than this is a bad one too
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
      autoFans: 1, // 1 = fans engage on their own on steep surfaces, 0 = only when held
      autoRight: 1, // 0–1 × jets.maxRollRate, rolling an inverted car upright near the ground
    },
    pro: {
      counterSteer: 0,
      driftAngle: 1,
      driftHold: 15,
      yawDamping: 0.5,
      tractionControl: 0,
      airLevel: 0.7,
      landing: 0.4,
      autoFans: 0,
      autoRight: 0,
    },
  },
  input: {
    stickDeadzone: 0.15, // stick tilt (0–1) ignored around the centre
    triggerDeadzone: 0.05, // trigger travel (0–1) ignored at rest
    buttonThreshold: 0.5, // a gamepad button counts as down above this value
    navThreshold: 0.6, // stick tilt (0–1) that counts as a menu up / down / left / right…
    navRelease: 0.35, // …and lets go below this, so a resting stick doesn't repeat
  },
  race: {
    countdown: 3, // s from restart to go; the car is held until then
    ringDepth: 1, // m, thickness of a ring's sensor along its axis (read at mount)
  },
  // Reveal run (M16.5): the stunt steps and their score (src/state/stuntRun.ts).
  reveal: {
    holdMin: 2, // s of unbroken ceiling hold that completes the inverted hold
    holdCap: 6, // s of hold that score at most
    floorY: 1.5, // m, the car touching below this height is back on the pad
    uprightDot: 0.7, // car up · world up that counts as rolled upright in the drop
    rowMargin: 1, // m, the fleet's footprint padded to the sides for "over the row"
    timeBonus: 3000, // points for a run of 0 s…
    timePerSecond: 25, // …less this per second, down to 0
    holdPerSecond: 250, // per s of inverted hold, once it reaches holdMin
    rollPerTurn: 500, // per turn of roll in the drop and over the fleet
    cleanLanding: 1000, // per clean landing (the drop and the fleet)
    noContact: 1500, // a run with no parked car clipped
    badLanding: 1000, // taken off per bad landing (or recovery with R mid-drop)
    hit: 500, // taken off per parked car clipped…
    hitCap: 4, // …counting at most this many
    fellOffLoop: 500, // taken off each time the car comes off the loop before the hold
    // Medal targets per assist mode. The sim's scripted run (`npm run sim:car proving`) scores
    // ~7,550 in 36 s on both; Pro is set lower, since it flies without auto-fans or auto-right.
    medals: {
      beginner: { bronze: 4000, silver: 6000, gold: 7500 },
      pro: { bronze: 3500, silver: 5500, gold: 7000 },
    },
  },
  camera: {
    // Main menu: the picture is drawn this many CSS pixels higher (a view offset, at most
    // 40% of the screen), so the car shows above the menu's bottom bar; eased at this rate (1/s).
    menuShift: 200,
    menuShiftDamping: 3,
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
      badLandingShake: 0.5, // extra trauma on a roof, side or too-hard landing
      hitShake: 0.5, // trauma added by a full-strength hit on a parked car
      // On a steep surface (a wall, the half-loop) the camera turns its up to the car's; on
      // the floor, gentle ramps and in the air it uses world up.
      surfaceAngleStart: 0.35, // rad of car tilt where the camera starts following its up…
      surfaceAngleFull: 0.7, // …and follows it fully
      upDamping: 4, // 1/s, how quickly the camera's up follows
      upMaxRate: 3, // rad/s, the fastest it turns, so it never flips in one frame
    },
  },
  // Visual effects driven by the car's state (src/vfx, src/scene/Effects.tsx).
  vfx: {
    landing: {
      minAirTime: 0.25, // s airborne before touching down counts as a landing
      minImpactSpeed: 2, // m/s fall speed of the weakest landing that kicks up dust
      fullImpactSpeed: 10, // m/s fall speed of a full-strength landing
    },
    // Clipping a parked car (the Proving Ground's fleet).
    hit: {
      fullImpactSpeed: 15, // m/s car speed of a full-strength hit
      minGap: 0.3, // s clear of the fleet before another touch counts as a new hit
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
    // Cold-gas jet plumes and vapour.
    jets: {
      length: 0.9, // m at full thrust
      attack: 25, // 1/s
      release: 10, // 1/s
      vapourRate: 40, // particles per second per jet at full thrust
      landingVapour: 60, // particles in the cloud of a clean landing
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
  // Sound (src/audio): synthesized, apart from the recorded drivetrain loops. Levels are
  // linear gains before the player's volume settings; how each sound is built (waveforms,
  // envelopes, loops) lives with it in src/audio.
  audio: {
    mix: {
      drivetrain: 0.9, // recorded motor bands
      gearWhine: 0.05,
      regen: 0.06,
      rumble: 0.5, // road and tyre noise
      surge: 0.35, // boost's power surge over the motor
      motor: 0.35, // synth motor, until the recordings load or if they fail
      whine: 0.06, // thin high inverter whine on top of the synth motor
      thruster: 0.5,
      wind: 0.25,
      skid: 0.3,
      fan: 0.25,
      jets: 0.3,
      oneShots: 0.8, // hop, landing, boost burst, respawn
      race: 0.6, // countdown, rings, finish
      ui: 0.4,
      music: 0.5,
    },
    // Recorded drivetrain (src/audio/drivetrain.ts). Motor speed picks a band: equal-power
    // crossfades between neighbouring band speeds, and each band's loop is played at
    // motor speed / the speed it was recorded at, within minRate–maxRate.
    drivetrain: {
      lowSpeed: 6, // m/s, centre of the pulling-away band
      midSpeed: 17, // m/s, cruising
      highSpeed: 30, // m/s, flat out
      minRate: 0.3, // playback rate floor, so the motor never stops at rest
      maxRate: 1.7,
      idleLevel: 0.12, // motor level at rest, as a fraction of the level at speed
      levelSpeed: 12, // m/s where the motor reaches full level
      loadLevel: 0.6, // extra motor level at full throttle
      darkCutoff: 1400, // Hz, low-pass on the motor when coasting
      brightCutoff: 9000, // Hz at full throttle
      loadFollow: 0.12, // s, time constant of the off-load ↔ on-load crossfade
      regenMinSpeed: 3, // m/s, below this lifting off brings in no regen
      regenLift: 0.5, // regen level when lifting off, as a fraction of braking's
      gearOrder: 96, // gear whine, Hz per m/s of road speed
      regenOrder: 64, // regen tone, Hz per m/s (the recorded motor tone's order)
      rumbleMinRate: 0.75, // road noise playback rate at rest
      rumbleMaxRate: 1.3, // and flat out
      airRevSpeed: 42, // m/s the unloaded motor spins up to in the air at full throttle
      airRevRate: 1.2, // s, time constant of the spin-up in the air
      landingDrop: 0.25, // s, time constant of the drop back to wheel speed on landing
      surgeRate: 1.15, // surge layer's pitch over the motor's
      fadeIn: 0.6, // s, crossfade from the synth motor once the recordings load
    },
    // Synth motor (M14), the fallback for the recordings.
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
    // Fan whine: a band of noise rising with suction.
    fan: {
      idlePitch: 900, // Hz, band centre at the lightest suction
      fullPitch: 2600, // Hz at full suction
    },
    // Jet hiss: high noise, louder with lift; the roll jets alone are quieter.
    jets: {
      pitch: 6500, // Hz, band centre
      rollLevel: 0.4, // roll jets' level as a fraction of lift's
    },
    skid: {
      minSkid: 0.25, // wheel skid (0–1) below which the tyres stay quiet
    },
    music: {
      tempo: 112, // BPM
    },
  },
}
