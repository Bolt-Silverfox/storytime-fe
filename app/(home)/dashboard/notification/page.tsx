'use client';

import BackButton from '@/components/back-button';
import Header from '@/components/header';
import {
  type NotificationItem,
  isUserLoggedIn,
  listNotificationsService,
  markAllNotificationsReadService,
} from '@/lib/services';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const formatDate = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const NotificationPage = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);
  const [marking, setMarking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const list = await listNotificationsService();
    setNotifications(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isUserLoggedIn()) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAll = async () => {
    setMarking(true);
    try {
      await markAllNotificationsReadService();
      await fetchNotifications();
    } catch (error) {
      toast.error(
        (error as { message?: string })?.message ||
          'Could not mark notifications as read'
      );
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'>
      <Header white={false} />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <div className='mb-6 flex items-start justify-between gap-4'>
          <div>
            <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
              Notifications
            </h2>
            <p className='text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
              Updates and reminders from Storytime.
            </p>
          </div>
          {loggedIn && notifications.length > 0 && (
            <button
              type='button'
              onClick={handleMarkAll}
              disabled={marking}
              className='shrink-0 rounded-full border border-[#EC4007] px-5 py-2.5 text-sm font-semibold text-[#EC4007] font-abeezee transition hover:bg-[#FEEAE6] disabled:opacity-50'
            >
              {marking ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>

        {!loggedIn ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              Log in to see your notifications.
            </p>
            <Link
              href='/login'
              className='mt-4 inline-block rounded-2xl bg-[#EC4007] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
            >
              Log in
            </Link>
          </div>
        ) : loading ? (
          <div className='flex flex-col gap-4'>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className='h-[5rem] animate-pulse rounded-3xl bg-stone-100'
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-12 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              You're all caught up — no notifications yet.
            </p>
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {notifications.map((item, index) => {
              const unread = !(item.isRead || item.read);
              const body = item.message ?? item.body ?? '';
              return (
                <div
                  key={item.id ?? index}
                  className={`rounded-3xl border px-6 py-5 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] transition-all ${
                    unread
                      ? 'border-[#F84020]/30 bg-[#FFF8ED]'
                      : 'border-stone-100 bg-white'
                  }`}
                >
                  <div className='flex items-start justify-between gap-4'>
                    <h3 className='text-[#221D1D] text-base not-italic font-bold leading-5 font-qilka'>
                      {item.title ?? ''}
                    </h3>
                    {unread && (
                      <span className='mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#EC4007]' />
                    )}
                  </div>
                  {body && (
                    <p className='mt-1 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
                      {body}
                    </p>
                  )}
                  {formatDate(item.createdAt) && (
                    <p className='mt-2 text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
                      {formatDate(item.createdAt)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default NotificationPage;
