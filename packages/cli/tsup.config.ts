import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  // cli.ts already has #!/usr/bin/env node — esbuild preserves it
  dts: false,
  sourcemap: false,
  clean: true,
  external: ['@agentify/core', 'commander', 'zod'],
})
