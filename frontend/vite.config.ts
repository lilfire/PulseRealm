import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 74'],
      modernTargets: ['chrome >= 74'],
    }),
  ],
  envDir: '..',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
