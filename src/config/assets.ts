// Asset paths. Files in `public/` are served from the app's base URL.
// The car model must follow docs/car-model-spec.md; swapping it is a change to this path only.
export const CAR_MODEL_URL = `${import.meta.env.BASE_URL}models/car.glb`

// The Proving Ground's parked cars, built by scripts/build-fleet-models.ts.
export const fleetModelUrl = (model: string) =>
  `${import.meta.env.BASE_URL}models/fleet/${model}.glb`

// The car model's licence credit (CC BY 4.0), shown in the main menu. Full details in
// assets/roadster-2026/LICENSE.txt.
export const CAR_MODEL_CREDIT = {
  author: 'asiphy007',
  site: 'Sketchfab',
  source: 'https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
}

// Sky HDRI for reflections and ambient light on day levels (those without art; night levels draw
// their own sky, src/scene/art/NightSky.tsx), so it's only fetched when one is shown:
// "Kloofendal 48d Partly Cloudy (Pure Sky)" by Greg Zaal and Jarod Guest, Poly Haven, CC0. Its sun is within 5° of the sun light in
// src/scene/Lights.tsx; keep them together if either changes.
export const ENVIRONMENT_URL = `${import.meta.env.BASE_URL}hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr`

// The drivetrain's recorded loops, built by scripts/build-audio.ts (src/audio/drivetrain.ts).
export const drivetrainSampleUrl = (file: string) =>
  `${import.meta.env.BASE_URL}audio/drivetrain/${file}`

// Where the drivetrain loops come from: both CC0, so no credit is required; listed here as the
// car model is. Time ranges and processing in assets/audio/LICENSE.txt.
export const DRIVETRAIN_SOUND_CREDITS = [
  {
    title: 'electric car - bmw i3 - driving - M+S 48k24b.WAV',
    author: 'tferrino',
    site: 'Freesound',
    source: 'https://freesound.org/people/tferrino/sounds/405285/',
    license: 'CC0 1.0',
    use: 'coasting loops and road rumble',
  },
  {
    title: 'Acceleration of an electric car (Tesla Model S Plaid)',
    author: 'justVova',
    site: 'Freesound',
    source: 'https://freesound.org/people/justVova/sounds/761685/',
    license: 'CC0 1.0',
    use: 'on-load loops and the boost surge',
  },
]
