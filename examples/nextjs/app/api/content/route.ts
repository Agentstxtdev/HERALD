/**
 * Payment-gated content endpoint.
 *
 * Payment is handled by middleware.ts — requests without a valid x402
 * payment header never reach this handler (they get a 402 response instead).
 */
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    data: 'Paid content — your x402 payment was verified by the payment middleware.',
    timestamp: new Date().toISOString(),
  })
}
