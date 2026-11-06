// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READ_ALONG_DEFAULT_KEY,
  setReadAlongDefault,
} from '@/lib/reader/read-along-preference';
import StoryView from './story-view';

vi.mock('@/lib/hooks/use-story-quota', () => ({
  useStoryQuota: () => ({ quota: null }),
}));
vi.mock('@/components/quota-indicator', () => ({ default: () => null }));
vi.mock('@/components/story-reader', () => ({
  default: ({
    readAlong,
    onReadAlongChange,
  }: {
    readAlong: boolean;
    onReadAlongChange: (on: boolean) => void;
  }) => (
    <button
      type='button'
      role='switch'
      aria-checked={readAlong}
      onClick={() => onReadAlongChange(!readAlong)}
    >
      read-along
    </button>
  ),
}));
vi.mock('@/components/mode-selector', () => ({ default: () => null }));
vi.mock('@/components/voice-selector', () => ({ default: () => null }));
vi.mock('@/components/ui/modal', () => ({
  default: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));
vi.mock('@/lib/services', () => ({
  addFavoriteService: vi.fn(),
  getPreferredVoiceService: () => Promise.resolve({ id: 'v1', name: 'Voice' }),
  getStoryByIdService: () => Promise.resolve({ id: 's1', title: 'T' }),
  getVoiceAccessService: () => Promise.resolve({}),
  isUserLoggedIn: () => true,
  listFavoritesService: () => Promise.resolve([]),
  removeFavoriteService: vi.fn(),
}));

async function openReader() {
  render(<StoryView storyId='s1' />);
  fireEvent.click(screen.getByRole('button', { name: 'Read this story' }));
  return screen.findByRole('switch', { name: 'read-along' });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('StoryView read-along default', () => {
  it('starts on when no preference is stored', async () => {
    const sw = await openReader();
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('starts off when the stored preference is false', async () => {
    setReadAlongDefault(false);
    const sw = await openReader();
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('flipping the switch on a story does not change the saved default', async () => {
    const sw = await openReader();
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(localStorage.getItem(READ_ALONG_DEFAULT_KEY)).toBeNull();
  });
});
