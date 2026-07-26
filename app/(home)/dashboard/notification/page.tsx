'use client';

import BackButton from '@/components/back-button';
import Header from '@/components/header';
import { Switch } from '@/components/ui/switch';
import { useWebPush } from '@/lib/hooks/use-web-push';

const NotificationPage = () => {
  const { supported, permission, enabled, enabling, enable, disable } =
    useWebPush();

  const denied = permission === 'denied';
  const unsupported = permission === 'unsupported' || !supported;

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-4 sm:px-6 md:px-10 py-6 md:py-[2.125rem] w-full max-w-6xl mx-auto my-6 md:my-12'>
      <Header white={false} />

      <section className='mt-12 max-w-xl'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
          Notifications
        </h2>
        <p className='mb-6 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          Choose how Storytime reaches you on this device.
        </p>

        <div className='flex items-center justify-between gap-4 rounded-2xl border border-stone-100 px-5 py-4'>
          <div className='min-w-0'>
            <p className='font-abeezee text-base text-[#221D1D]'>
              Browser notifications
            </p>
            <p className='font-abeezee text-sm text-[#4A413F]'>
              {unsupported
                ? 'This browser does not support web push notifications.'
                : denied
                  ? 'Notifications are blocked in your browser settings.'
                  : 'Get story updates and reminders as push notifications.'}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={unsupported || denied || enabling}
            onCheckedChange={(next) => {
              if (next) {
                enable();
              } else {
                disable();
              }
            }}
            aria-label='Toggle browser notifications'
          />
        </div>
      </section>
    </div>
  );
};

export default NotificationPage;
