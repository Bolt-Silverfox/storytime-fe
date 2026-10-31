'use client';

import { useTheme } from 'next-themes';
import { useEffect } from 'react';

const COLORS = { light: '#FAF4F2', dark: '#1A1514' } as const;

/**
 * The viewport `themeColor` metas follow the OS scheme via media queries. When
 * the user picks Light or Dark explicitly, point both metas at that colour so
 * the mobile browser bar matches; on System, restore the media-based originals.
 *
 * Next re-creates the <meta name="theme-color"> nodes on every client
 * navigation, so the override is re-applied whenever <head> children change.
 * The sync only writes `content` (an attribute), which the childList observer
 * does not see, so it cannot loop.
 */
export function ThemeColorSync() {
  const { theme, setTheme } = useTheme();

  // A stale/unknown stored value (e.g. localStorage.theme='bogus') would leave
  // the page unthemed while the controls claim System; normalise it.
  useEffect(() => {
    if (
      theme !== undefined &&
      theme !== 'light' &&
      theme !== 'dark' &&
      theme !== 'system'
    ) {
      setTheme('system');
    }
  }, [theme, setTheme]);

  useEffect(() => {
    const apply = () => {
      const metas = document.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]'
      );
      for (const meta of metas) {
        if (meta.dataset.origContent === undefined) {
          meta.dataset.origContent = meta.content;
        }
        const next =
          theme === 'light' || theme === 'dark'
            ? COLORS[theme]
            : meta.dataset.origContent;
        if (meta.content !== next) {
          meta.content = next;
        }
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [theme]);

  return null;
}
