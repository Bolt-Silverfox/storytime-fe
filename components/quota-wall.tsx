import Link from 'next/link';

// Shown when opening a NEW story is refused for quota (backend 403). Guests are
// pointed at sign-up; logged-in free users at the app (subscriptions are only
// sold there). Already-read stories remain free either way.
export default function QuotaWall({ isGuest }: { isGuest: boolean }) {
  return (
    <div className='flex flex-col items-center justify-center h-64 text-center px-4'>
      <h3 className='text-strong text-2xl not-italic font-bold leading-7 font-qilka mb-2'>
        You've enjoyed your free stories!
      </h3>
      <p className='text-body text-base not-italic font-normal leading-5 font-abeezee mb-6 max-w-md'>
        {isGuest
          ? 'Sign up to keep reading unlimited stories with audio narration.'
          : 'Upgrade to premium in the Storytime app for unlimited stories.'}{' '}
        Stories you&apos;ve already read are still free.
      </p>
      {isGuest ? (
        <Link
          href='/register'
          className='rounded-[3.125rem] bg-brand px-8 py-4 text-base font-semibold text-white transition hover:opacity-90'
        >
          Sign up to read more
        </Link>
      ) : null}
    </div>
  );
}
