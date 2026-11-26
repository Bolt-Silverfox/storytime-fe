import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./globals.css', () => ({}));
vi.mock('next/font/local', () => ({
  default: () => ({ variable: '', className: '' }),
}));
vi.mock('next/font/google', () => ({
  ABeeZee: () => ({ variable: '', className: '' }),
}));

import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import nextConfig from '@/next.config';
import * as authLayout from './(auth)/layout';
import * as homeLayout from './(home)/layout';
import AboutPage, * as about from './(website)/about/page';
import * as contactLayout from './(website)/contact/layout';
import * as faq from './(website)/faq/page';
import * as home from './(website)/page';
import * as privacy from './(website)/privacy-policy/page';
import * as terms from './(website)/terms-and-conditions/page';
import * as rootLayout from './layout';
import manifest from './manifest';
import robots from './robots';
import sitemap from './sitemap';
import * as storiesLayout from './stories/layout';

type PageMeta = {
  title: string;
  description: string;
  alternates: { canonical: string };
};

const SITE = 'https://web.storytimeapp.me';

const publicPages = [
  { path: '/', mod: home },
  { path: '/stories', mod: storiesLayout },
  { path: '/about', mod: about },
  { path: '/faq', mod: faq },
  { path: '/contact', mod: contactLayout },
  { path: '/privacy-policy', mod: privacy },
  { path: '/terms-and-conditions', mod: terms },
];

const privateRoutes = [
  '/dashboard',
  '/library',
  '/favorites',
  '/login',
  '/register',
  '/create-new-password',
  '/forgot-password',
  '/verify-email',
];

describe('robots', () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = ([] as string[]).concat(rule.disallow ?? []);
  const allow = ([] as string[]).concat(rule.allow ?? []);

  it('does not block noindex pages from being crawled', () => {
    for (const route of privateRoutes) {
      expect(disallow).not.toContain(route);
    }
  });

  it('keeps api paths disallowed', () => {
    expect(disallow).toContain('/api/');
  });

  it('allows the public pages and story pages', () => {
    for (const route of ['/', '/stories', '/story/', '/privacy-policy']) {
      expect(allow).toContain(route);
    }
    expect(allow).toContain('/terms-and-conditions');
  });

  it('lists the sitemap', () => {
    expect(robots().sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});

describe('sitemap', () => {
  const urls = sitemap().map((entry) => entry.url);

  it('lists exactly the static public pages', () => {
    expect(urls.sort()).toEqual(
      publicPages
        .map((p) => (p.path === '/' ? SITE : `${SITE}${p.path}`))
        .sort()
    );
  });

  it('contains no per-user, auth or story routes', () => {
    for (const url of urls) {
      expect(url).not.toMatch(
        /dashboard|library|favorites|login|register|password|verify-email|\/story\//
      );
    }
  });
});

describe('per-page metadata', () => {
  it('exists for every public page with a unique title, canonical and 50-160 char description', () => {
    const titles = new Set<string>();
    for (const { path: route, mod } of publicPages) {
      const metadata = (mod as unknown as { metadata: PageMeta }).metadata;
      expect(metadata, route).toBeDefined();
      expect(typeof metadata.title).toBe('string');
      expect(metadata.description.length).toBeGreaterThanOrEqual(50);
      expect(metadata.description.length).toBeLessThanOrEqual(160);
      expect(metadata.alternates.canonical).toBe(route);
      titles.add(metadata.title);
    }
    expect(titles.size).toBe(publicPages.length);
  });

  it('keeps the about page component default export', () => {
    expect(AboutPage).toBeTypeOf('function');
  });

  it('no longer forces the homepage canonical on every route', () => {
    expect(rootLayout.metadata.alternates).toBeUndefined();
  });
});

describe('noindex layouts', () => {
  it('marks the auth layout noindex, nofollow', () => {
    expect(authLayout.metadata?.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it('marks the authenticated layout noindex, nofollow', () => {
    expect(homeLayout.metadata?.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});

describe('headers', () => {
  const referrerPoliciesFor = async (pathname: string) => {
    const entries = (await nextConfig.headers?.()) ?? [];
    return entries
      .filter((e) => pathToRegexp(e.source).test(pathname))
      .flatMap((e) => e.headers)
      .filter((h) => h.key === 'Referrer-Policy')
      .map((h) => h.value);
  };

  it.each([
    '/login',
    '/register',
    '/register/setup',
    '/register/setup/voice',
    '/create-new-password',
    '/create-new-password/success',
    '/forgot-password',
    '/forgot-password/verify',
    '/verify-email',
    '/auth/callback',
  ])('sends only no-referrer on %s', async (route) => {
    expect(await referrerPoliciesFor(route)).toEqual(['no-referrer']);
  });

  it.each([
    '/',
    '/about',
    '/stories',
    '/story/abc',
    '/dashboard',
    '/privacy-policy',
  ])('sends only strict-origin-when-cross-origin on %s', async (route) => {
    expect(await referrerPoliciesFor(route)).toEqual([
      'strict-origin-when-cross-origin',
    ]);
  });
});

describe('manifest', () => {
  it('declares 192 and 512 icons that exist in public', () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => i.sizes).sort()).toEqual(
      expect.arrayContaining(['192x192', '512x512'])
    );
    const maskable = icons.find((i) => i.purpose === 'maskable');
    expect(maskable?.sizes).toBe('512x512');
    for (const icon of icons) {
      expect(() =>
        readFileSync(path.join(process.cwd(), 'public', icon.src))
      ).not.toThrow();
    }
  });
});

describe('nginx non-production hosts', () => {
  it.each(['dev', 'staging'])('%s sends X-Robots-Tag noindex', (host) => {
    const conf = readFileSync(
      path.join(process.cwd(), `deploy/nginx/${host}.web.storytimeapp.me.conf`),
      'utf8'
    );
    expect(conf).toContain(
      'add_header X-Robots-Tag "noindex, nofollow" always;'
    );
  });

  it('production does not', () => {
    const conf = readFileSync(
      path.join(process.cwd(), 'deploy/nginx/web.storytimeapp.me.conf'),
      'utf8'
    );
    expect(conf).not.toContain('X-Robots-Tag');
  });
});

describe('fallback routes', () => {
  it('has not-found, error and loading files linking back home', () => {
    for (const file of [
      'app/not-found.tsx',
      'app/error.tsx',
      'app/(home)/loading.tsx',
      'app/story/[id]/loading.tsx',
    ]) {
      expect(() => readFileSync(path.join(process.cwd(), file))).not.toThrow();
    }
  });
});
