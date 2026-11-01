// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  isUserLoggedIn: vi.fn(),
  getStoryByIdService: vi.fn(),
  getPreferredVoiceService: vi.fn(),
  getVoiceAccessService: vi.fn(),
  getAvailableVoicesService: vi.fn(),
  listFavoritesService: vi.fn(),
  addFavoriteService: vi.fn(),
  removeFavoriteService: vi.fn(),
}));
vi.mock('@/lib/services', () => svc);
vi.mock('@/lib/hooks/use-story-quota', () => ({
  useStoryQuota: () => ({ quota: null }),
}));
vi.mock('@/components/quota-indicator', () => ({ default: () => null }));
vi.mock('@/components/mode-selector', () => ({ default: () => null }));
vi.mock('@/components/voice-selector', () => ({
  default: ({
    setStep,
    onVoiceSelected,
  }: {
    setStep: (n: number) => void;
    onVoiceSelected: (v: null) => void;
  }) => (
    <button
      type='button'
      onClick={() => {
        onVoiceSelected(null);
        setStep(3);
      }}
    >
      continue
    </button>
  ),
}));
vi.mock('@/components/ui/modal', () => ({
  default: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));
const reader = vi.hoisted(() => vi.fn());
vi.mock('@/components/story-reader', () => ({
  default: (props: { voice: string; voiceId?: string | null }) => {
    reader(props);
    return <div data-testid='reader'>{props.voice}</div>;
  },
}));

import StoryView from './story-view';

const VOICES = [
  { id: 'NIMBUS', name: 'nimbus', displayName: 'Nimbus' },
  { id: 'uuid-2', name: 'bella', displayName: 'Bella' },
];

const open = async () => {
  render(<StoryView storyId='s1' />);
  fireEvent.click(screen.getByText('Read this story'));
};

describe('StoryView reader voice label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.listFavoritesService.mockResolvedValue([]);
    svc.getStoryByIdService.mockResolvedValue({ id: 's1', questions: [] });
    svc.getAvailableVoicesService.mockResolvedValue(VOICES);
    svc.isUserLoggedIn.mockReturnValue(true);
  });
  afterEach(cleanup);

  it('preferred voice: shows its name and sends its id', async () => {
    svc.getPreferredVoiceService.mockResolvedValue({
      id: 'uuid-2',
      name: 'Bella',
    });
    svc.getVoiceAccessService.mockResolvedValue({
      isPremium: true,
      lockedVoiceId: null,
      defaultVoice: 'NIMBUS',
    });
    await open();
    await waitFor(() =>
      expect(screen.getByTestId('reader').textContent).toBe('Bella')
    );
    expect(reader.mock.lastCall?.[0].voiceId).toBe('uuid-2');
  });

  it('no preferred + lockedVoiceId: shows locked voice name, voiceId stays null', async () => {
    svc.getPreferredVoiceService.mockResolvedValue(null);
    svc.getVoiceAccessService.mockResolvedValue({
      isPremium: false,
      lockedVoiceId: 'uuid-2',
      defaultVoice: 'NIMBUS',
    });
    await open();
    await waitFor(() =>
      expect(screen.getByTestId('reader').textContent).toBe('Bella')
    );
    expect(reader.mock.lastCall?.[0].voiceId).toBeNull();
  });

  it('no preferred + defaultVoice only: shows default voice name, voiceId stays null', async () => {
    svc.getPreferredVoiceService.mockResolvedValue(null);
    svc.getVoiceAccessService.mockResolvedValue({
      isPremium: false,
      lockedVoiceId: null,
      defaultVoice: 'NIMBUS',
    });
    await open();
    await waitFor(() =>
      expect(screen.getByTestId('reader').textContent).toBe('Nimbus')
    );
    expect(reader.mock.lastCall?.[0].voiceId).toBeNull();
  });

  it('guest: shows resolved default voice name, no voiceId', async () => {
    svc.isUserLoggedIn.mockReturnValue(false);
    svc.getVoiceAccessService.mockResolvedValue({
      isPremium: false,
      lockedVoiceId: null,
      defaultVoice: 'NIMBUS',
    });
    await open();
    await waitFor(() =>
      expect(svc.getAvailableVoicesService).toHaveBeenCalled()
    );
    fireEvent.click(await screen.findByText('continue'));
    await waitFor(() =>
      expect(screen.getByTestId('reader').textContent).toBe('Nimbus')
    );
    expect(reader.mock.lastCall?.[0].voiceId).toBeNull();
  });

  it('guest: unresolvable voice falls back to a neutral label', async () => {
    svc.isUserLoggedIn.mockReturnValue(false);
    svc.getVoiceAccessService.mockResolvedValue({
      isPremium: false,
      lockedVoiceId: null,
      defaultVoice: null,
    });
    svc.getAvailableVoicesService.mockRejectedValue(new Error('x'));
    await open();
    fireEvent.click(await screen.findByText('continue'));
    await waitFor(() =>
      expect(screen.getByTestId('reader').textContent).toBe('Default voice')
    );
  });
});
