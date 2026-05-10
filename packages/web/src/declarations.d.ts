/**
 * Ambient declarations for optional peer dependencies.
 *
 * These packages are not installed at build time — declaring them as bare ambient
 * modules lets TypeScript accept dynamic `import('mppx/server')` etc. without errors.
 * The actual types are provided at runtime by the installed package.
 */
declare module 'mppx/server'
declare module 'mppx/express'
declare module 'mppx/hono'
declare module 'mppx/nextjs'
declare module 'stripe'

// next/server — next@16 uses internal subpath re-exports that TypeScript NodeNext
// cannot resolve without an exports map. Stubs here satisfy DTS build;
// consumers with next installed get the real types at their project boundary.
declare module 'next/server' {
  export class NextRequest extends Request {
    readonly nextUrl: URL
    headers: Headers
  }
  export class NextResponse extends Response {
    static json(data: unknown, init?: ResponseInit): NextResponse
    static next(init?: ResponseInit): NextResponse
  }
}

/**
 * `console` is present in all target runtimes (Node.js, Deno, Bun, edge workers)
 * but is not part of lib: ["ES2022"]. Declare the subset we use so the package
 * compiles without requiring @types/node or lib: ["dom"].
 */
declare var console: {
  warn(...args: unknown[]): void
  log(...args: unknown[]): void
  error(...args: unknown[]): void
}
