// Asset paths. Files in `public/` are served from the app's base URL.
// The car model must follow docs/car-model-spec.md; swapping it is a change to this path only.
export const CAR_MODEL_URL = `${import.meta.env.BASE_URL}models/car.glb`

// The car model's licence credit (CC BY 4.0), shown in the main menu. Full details in
// assets/roadster-2026/LICENSE.txt.
export const CAR_MODEL_CREDIT = {
  author: 'asiphy007',
  site: 'Sketchfab',
  source: 'https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
}
