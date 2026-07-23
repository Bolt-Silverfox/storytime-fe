'use client';

import { useFavorite } from '@/lib/favorites-store';
import type { MouseEvent } from 'react';

const FavoriteHeart = ({
  storyId,
  className,
}: {
  storyId: string;
  className?: string;
}) => {
  const { isFavorite, canFavorite, toggle } = useFavorite(storyId);

  // Guests can't favorite — hide the control entirely.
  if (!canFavorite) {
    return null;
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Prevent triggering the surrounding <Link> navigation.
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-md transition hover:scale-110 ${
        className ?? ''
      }`}
    >
      {isFavorite ? '❤️' : '🤍'}
    </button>
  );
};

export default FavoriteHeart;
