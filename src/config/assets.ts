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

// Sky HDRI for reflections and ambient light: "Kloofendal 48d Partly Cloudy (Pure Sky)" by
// Greg Zaal and Jarod Guest, Poly Haven, CC0. Its sun is within 5° of the sun light in
// src/scene/Lights.tsx; keep them together if either changes.
export const ENVIRONMENT_URL = `${import.meta.env.BASE_URL}hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr`
