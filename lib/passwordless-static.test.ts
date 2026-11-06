import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('AASA', () => {
  const aasa = JSON.parse(
    readFileSync('public/.well-known/apple-app-site-association', 'utf8')
  );
  const detail = aasa.applinks.details[0];

  it('stays valid JSON and keeps the story entries', () => {
    expect(detail.appID).toBe('36CFL54G89.net.emerj.storytime');
    expect(detail.paths).toContain('/story/*');
    expect(detail.components).toContainEqual(
      expect.objectContaining({ '/': '/story/*' })
    );
  });

  it('makes no /auth/magic universal-link claim until the app has a handler', () => {
    expect(detail.paths).toEqual(['/story/*']);
    expect(detail.components).toHaveLength(1);
    expect(JSON.stringify(aasa)).not.toContain('auth/magic');
  });
});

describe('next.config headers', () => {
  it('sends no-referrer for the magic-link route and keeps the AASA headers', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const magic = rules.find((r) => r.source === '/auth/magic');
    expect(magic?.headers).toContainEqual({
      key: 'Referrer-Policy',
      value: 'no-referrer',
    });
    expect(
      rules.some((r) => r.source === '/.well-known/apple-app-site-association')
    ).toBe(true);
  });
});
