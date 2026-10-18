# Roadster

A browser driving game: a Roadster-style car that can boost, hop and glide through a ring time trial.

**Play:** https://hejazizo.github.io/Roadster/

Built with Vite, TypeScript, React, React Three Fiber, Rapier and Zustand. Commands and project layout are in [`CLAUDE.md`](CLAUDE.md); the plan is in [`ROADMAP.md`](ROADMAP.md).

## Credits

- **Car model:** ["Tesla Roadtser 2026"](https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89) by asiphy007 on Sketchfab, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: decimated, wheels rebuilt from one template, split into separate materials with recolourable paint, light bar added (details in [`assets/roadster-2026/LICENSE.txt`](assets/roadster-2026/LICENSE.txt)). The licence covers the model only, not any car maker's trademarks or design.
- **Sky HDRI:** ["Kloofendal 48d Partly Cloudy (Pure Sky)"](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) by Greg Zaal and Jarod Guest on [Poly Haven](https://polyhaven.com), CC0.
- **Fonts:** [Satoshi](https://www.fontshare.com/fonts/satoshi) by Indian Type Foundry, served by Fontshare under the ITF Free Font License; [IBM Plex Mono](https://github.com/IBM/plex) by IBM, SIL Open Font License, bundled via `@fontsource/ibm-plex-mono`. Icons: [Lucide](https://lucide.dev), ISC.
- **Sound and music:** generated in code with the Web Audio API; there are no audio files.
- **Parked cars** (Proving Ground): generic low-poly vehicles built in code (`scripts/build-fleet-models.ts`); no third-party models.
- **Placeholder car** (fallback source): [Kenney Car Kit](https://kenney.nl/assets/car-kit), CC0. Thanks, Kenney.
