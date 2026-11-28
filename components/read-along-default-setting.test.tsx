// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getReadAlongDefault,
  READ_ALONG_DEFAULT_KEY,
  setReadAlongDefault,
} from '@/lib/reader/read-along-preference';
import ReadAlongDefaultSetting from './read-along-default-setting';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ReadAlongDefaultSetting', () => {
  it('is labelled and on by default', () => {
    render(<ReadAlongDefaultSetting />);
    const sw = screen.getByRole('switch', { name: 'Read along by default' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('reflects a stored false preference', () => {
    setReadAlongDefault(false);
    render(<ReadAlongDefaultSetting />);
    expect(
      screen
        .getByRole('switch', { name: 'Read along by default' })
        .getAttribute('aria-checked')
    ).toBe('false');
  });

  it('writes the preference when toggled', () => {
    render(<ReadAlongDefaultSetting />);
    const sw = screen.getByRole('switch', { name: 'Read along by default' });
    fireEvent.click(sw);
    expect(getReadAlongDefault()).toBe(false);
    expect(localStorage.getItem(READ_ALONG_DEFAULT_KEY)).toBe('false');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(getReadAlongDefault()).toBe(true);
  });

  it('hydrates a stored false value without a mismatch warning', async () => {
    const html = renderToString(<ReadAlongDefaultSetting />);
    expect(html).toContain('aria-checked="true"');
    setReadAlongDefault(false);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await act(async () => {
      hydrateRoot(container, <ReadAlongDefaultSetting />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(
      container.querySelector('[role=switch]')?.getAttribute('aria-checked')
    ).toBe('false');
    container.remove();
  });
});
