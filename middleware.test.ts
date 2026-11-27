// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (offsetSec: number) =>
  `${b64({})}.${b64({ exp: Math.floor(Date.now() / 1000) + offsetSec })}.s`;
const VALID = token(3600);
const EXPIRED = token(-6 * 86400);

type Cookies = { access?: string; refresh?: string };
// Returns the redirect path, or null when the request passes through.
const run = (path: string, c: Cookies): string | null => {
  const parts: string[] = [];
  if (c.access) {
    parts.push(`accessToken=${c.access}`);
  }
  if (c.refresh) {
    parts.push(`refreshToken=${c.refresh}`);
  }
  const req = new NextRequest(`http://localhost:3100${path}`, {
    headers: parts.length ? { cookie: parts.join('; ') } : {},
  });
  const res = middleware(req);
  const loc = res.headers.get('location');
  return loc ? new URL(loc).pathname : null;
};

const PROTECTED = ['/dashboard', '/library', '/favorites'];
const GUEST_ONLY = ['/login', '/register', '/stories'];

const states: Record<string, { c: Cookies; signedIn: boolean }> = {
  'no cookies': { c: {}, signedIn: false },
  'expired access, no refresh': { c: { access: EXPIRED }, signedIn: false },
  'malformed access, no refresh': { c: { access: 'abc' }, signedIn: false },
  'valid access only': { c: { access: VALID }, signedIn: true },
  'expired access + refresh': {
    c: { access: EXPIRED, refresh: 'r' },
    signedIn: true,
  },
  'refresh only': { c: { refresh: 'r' }, signedIn: true },
};

describe('middleware cookie state x path', () => {
  for (const [name, { c, signedIn }] of Object.entries(states)) {
    describe(name, () => {
      for (const p of PROTECTED) {
        it(`${p} -> ${signedIn ? 'passes' : '/login'}`, () => {
          expect(run(p, c)).toBe(signedIn ? null : '/login');
        });
      }
      for (const p of GUEST_ONLY) {
        it(`${p} -> ${signedIn ? '/dashboard' : 'passes'}`, () => {
          expect(run(p, c)).toBe(signedIn ? '/dashboard' : null);
        });
      }
      it('/login?loggedOut=1 always passes', () => {
        expect(run('/login?loggedOut=1', c)).toBeNull();
      });
    });
  }
});
