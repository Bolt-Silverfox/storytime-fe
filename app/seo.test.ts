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

  it('disallows every auth and per-user route', () => {
    for (const route of privateRoutes) {
      expect(disallow).toContain(route);
    }
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
  it('sends no-referrer on auth routes', async () => {
    const entries = (await nextConfig.headers?.()) ?? [];
    const sources = entries
      .filter((e) =>
        e.headers.some(
          (h) => h.key === 'Referrer-Policy' && h.value === 'no-referrer'
        )
      )
      .map((e) => e.source);
    for (const prefix of [
      '/login',
      '/register',
      '/create-new-password',
      '/forgot-password',
      '/verify-email',
    ]) {
      expect(sources.some((s) => s.startsWith(prefix))).toBe(true);
    }
  });

  it('sends strict-origin-when-cross-origin elsewhere', async () => {
    const entries = (await nextConfig.headers?.()) ?? [];
    const fallback = entries.find((e) =>
      e.headers.some(
        (h) =>
          h.key === 'Referrer-Policy' &&
          h.value === 'strict-origin-when-cross-origin'
      )
    );
    expect(fallback).toBeDefined();
    expect(fallback?.source).toContain('(?!');
  });
});

describe('manifest', () => {
  it('declares 192 and 512 icons that exist in public', () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => i.sizes).sort()).toEqual(
      expect.arrayContaining(['192x192', '512x512'])
    );
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
