import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base must match the GitHub Pages repo path
export default defineConfig({
  base: '/dark-constellation/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // ONE THREE.JS, IN A CHUNK OF ITS OWN (v2.0 R3). The title's hero is
        // the game's own theater now, so the title and the game ask for
        // exactly the same modules, and left to itself the build folds
        // three.js and the theater into one chunk: a change to the theater
        // would then re-download all of three.js, and the budget could no
        // longer say how much of that chunk is the library
        // (scripts/bundle-budget.mjs, threeChunkMarker). Named here, three.js
        // is its own file and the theater is another.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
})
