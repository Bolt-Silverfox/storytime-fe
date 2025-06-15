import Link from 'next/link';

export const AuthFooter = () => {
  return (
    <footer className='max-w-[437px] absolute -translate-x-1/2 left-1/2 bottom-10 text-center mx-auto text-xs font-abeezee '>
      By accepting to continue, you agree to storytime's{' '}
      <Link href='#' className='text-[#0731EC] hover:underline'>
        Terms and Conditions
      </Link>{' '}
      and{' '}
      <Link href='#' className='text-[#0731EC] hover:underline'>
        Privacy Policy
      </Link>
    </footer>
  );
};
