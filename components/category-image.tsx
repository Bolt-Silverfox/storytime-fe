'use client';

import { cn } from '@/lib/utils';
import Image, { type StaticImageData } from 'next/image';
import { useState } from 'react';

interface CategoryImageProps {
  src?: string | StaticImageData | null;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  /** Optional label shown inside the fallback block (defaults to hidden). */
  label?: string;
  showLabel?: boolean;
}

const CategoryImageFallback = ({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-br from-[#FCE9CE] to-[#FDEEE9]',
        className
      )}
    >
      <div className='flex flex-col items-center gap-1 px-3 text-center'>
        <span className='text-4xl' aria-hidden='true'>
          📚
        </span>
        {label ? (
          <span className='font-qilka text-sm font-bold leading-5 text-[#221D1D] line-clamp-2'>
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Renders a category image with a graceful fallback. When the source is
 * missing or fails to load, a soft brand-gradient block (with an optional
 * label) is shown instead of a broken image. Remote URLs use a plain <img>
 * to avoid the next.config image allowlist; local/bundled assets use
 * next/image for optimization.
 */
const CategoryImage = ({
  src,
  alt,
  className,
  fill,
  width,
  height,
  label,
  showLabel,
}: CategoryImageProps) => {
  const [errored, setErrored] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // Reset the error state when the source changes (render-time pattern so we
  // don't need an effect just to clear state).
  if (src !== prevSrc) {
    setPrevSrc(src);
    setErrored(false);
  }

  if (!src || errored) {
    return (
      <CategoryImageFallback
        className={className}
        label={showLabel ? (label ?? alt) : undefined}
      />
    );
  }

  const isRemote = typeof src === 'string' && /^https?:\/\//.test(src);

  if (isRemote) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host, avoids next.config image allowlist
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      {...(fill
        ? { fill: true }
        : { width: width ?? 224, height: height ?? 224 })}
      className={className}
      onError={() => setErrored(true)}
    />
  );
};

export default CategoryImage;
