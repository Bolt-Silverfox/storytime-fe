import { NextResponse } from 'next/server';

/**
 * Liveness/readiness probe for blue-green health gating.
 * The deploy script curls this on the new color before flipping traffic.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'storytime-fe',
      // Baked at build time; lets you confirm which color/build is serving.
      apiBase: process.env.NEXT_PUBLIC_API_URL ?? null,
      commit: process.env.NEXT_PUBLIC_GIT_SHA ?? null,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
