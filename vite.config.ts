import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the game from /Roadster/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    // Rapier inlines its WASM, so its chunk is ~2.2 MB on its own; the limit sits just
    // above it so any other chunk that grows past a few hundred kB still warns.
    chunkSizeWarningLimit: 2400,
    rolldownOptions: {
      output: {
        // Libraries in their own chunks, so a game change doesn't re-download them.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/ },
            {
              name: 'three',
              test: /node_modules[\\/](three|three-stdlib|three-mesh-bvh|@react-three|@monogrid|troika-[^\\/]+|camera-controls|maath|meshline|stats-gl|stats\.js|suspend-react|its-fine|postprocessing|n8ao)[\\/]/,
            },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
