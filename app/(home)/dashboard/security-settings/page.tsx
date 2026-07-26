'use client';

import { LinkedAccounts } from '@/components/auth/linked-accounts';
import BackButton from '@/components/back-button';
import Header from '@/components/header';

const SecuritySettingsPage = () => {
  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-4 sm:px-6 md:px-10 py-6 md:py-[2.125rem] w-full max-w-6xl mx-auto my-6 md:my-12'>
      <Header white={false} />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
          Security settings
        </h2>
        <p className='mb-6 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          Manage how you sign in to your account.
        </p>

        <LinkedAccounts />
      </section>
    </div>
  );
};

export default SecuritySettingsPage;
