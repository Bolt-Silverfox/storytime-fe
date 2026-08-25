'use client';

// Catches render errors in the root layout itself, which error.tsx boundaries
// can't reach. Must render its own <html>/<body>.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang='en'>
      <body className='flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center'>
        <h2 className='text-xl font-semibold'>Something went wrong</h2>
        <p className='text-sm text-gray-500'>
          An unexpected error occurred. Please try again.
        </p>
        <button
          type='button'
          onClick={reset}
          className='rounded-md bg-black px-4 py-2 text-sm text-white'
        >
          Try again
        </button>
      </body>
    </html>
  );
}
