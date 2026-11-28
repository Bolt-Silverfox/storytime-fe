// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
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

  it.each([
    { stored: null, changedTo: 'false', open: 'true' },
    { stored: false, changedTo: 'true', open: 'false' },
  ])(
    'keeps the open story at $open when another tab sets the default to $changedTo',
    async ({ stored, changedTo, open }) => {
      if (stored !== null) {
        setReadAlongDefault(stored);
      }
      const sw = await openReader();
      act(() => {
        localStorage.setItem(READ_ALONG_DEFAULT_KEY, changedTo);
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: READ_ALONG_DEFAULT_KEY,
            newValue: changedTo,
          })
        );
      });
      expect(sw.getAttribute('aria-checked')).toBe(open);
    }
  );
});
