// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthState } from '@/lib/use-auth-state';

const set = (v: string) => {
  document.cookie = v;
};
const expire = (n: string) =>
  set(`${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`);

describe('useAuthState', () => {
  beforeEach(() => {
    expire('refreshToken');
    expire('accessToken');
  });
  afterEach(cleanup);

  it("is 'unknown' on the server", () => {
    function Probe() {
      return createElement('span', null, useAuthState());
    }
    expect(renderToString(createElement(Probe))).toContain('unknown');
  });

  it("is 'out' for guests and 'in' with a token cookie", () => {
    expect(renderHook(() => useAuthState()).result.current).toBe('out');
    cleanup();
    set('refreshToken=r; path=/');
    expect(renderHook(() => useAuthState()).result.current).toBe('in');
  });

  it.each([
    ['window', 'focus'],
    ['window', 'storage'],
    ['document', 'visibilitychange'],
  ] as const)(
    're-checks on %s %s (cookie changes in another tab)',
    (target, event) => {
      const { result } = renderHook(() => useAuthState());
      expect(result.current).toBe('out');
      set('refreshToken=r; path=/');
      act(() => {
        (target === 'window' ? window : document).dispatchEvent(
          new Event(event)
        );
      });
      expect(result.current).toBe('in');
      expire('refreshToken');
      act(() => {
        (target === 'window' ? window : document).dispatchEvent(
          new Event(event)
        );
      });
      expect(result.current).toBe('out');
    }
  );

  it('removes all listeners on unmount', () => {
    const w = vi.spyOn(window, 'removeEventListener');
    const d = vi.spyOn(document, 'removeEventListener');
    renderHook(() => useAuthState()).unmount();
    expect(w.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['focus', 'storage'])
    );
    expect(d.mock.calls.map((c) => c[0])).toContain('visibilitychange');
  });
});
