import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/express.ts', 'src/hono.ts', 'src/nextjs.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // All framework deps are optional peers — never bundle them
  external: [
    '@herald/core',
    'express',
    '@x402/express',
    'next',
    '@x402/next',
    'hono',
    '@x402/hono',
    'mppx',
    'mppx/server',
    'stripe',
  ],
})
