'use client';

import BackButton from '@/components/back-button';
import Header from '@/components/header';
import { Switch } from '@/components/ui/switch';
import { useWebPush } from '@/lib/hooks/use-web-push';
import {
  type NotificationItem,
  type NotificationPreference,
  getNotificationPreferencesService,
  getUserFromStorage,
  isUserLoggedIn,
  listNotificationsService,
  markAllNotificationsReadService,
  updateNotificationPreferenceService,
} from '@/lib/services';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type TabKey = 'inbox' | 'settings';

const CATEGORY_LABELS: Record<string, string> = {
  NEW_STORY: 'New stories',
  STORY_FINISHED: 'Story finished',
  STORY_RECOMMENDATION: 'Story recommendations',
  FEEDBACK: 'Feedback requests',
  WE_MISS_YOU: 'We miss you',
  SUBSCRIPTION_REMINDER: 'Subscription reminders',
  SUBSCRIPTION_ALERT: 'Subscription updates',
  PAYMENT_FAILED: 'Payment issues',
  PAYMENT_SUCCESS: 'Payment confirmations',
  INCOMPLETE_STORY_REMINDER: 'Incomplete story reminder',
  DAILY_LISTENING_REMINDER: 'Daily listening reminder',
  DAILY_CHALLENGE_REMINDER: 'Daily challenge reminder',
  ACHIEVEMENT_UNLOCKED: 'Achievements unlocked',
  BADGE_EARNED: 'Badges earned',
  STREAK_MILESTONE: 'Streak milestones',
};

const CHANNEL_LABELS: Record<string, string> = {
  push: 'Push',
  email: 'Email',
  in_app: 'In-app',
};

// Sections mirror the mobile app's grouping. Auth/security and system
// transactional categories are intentionally omitted from the user-facing
// toggles.
const SECTIONS: { title: string; categories: string[] }[] = [
  {
    title: 'Discovery & content',
    categories: [
      'NEW_STORY',
      'STORY_FINISHED',
      'STORY_RECOMMENDATION',
      'FEEDBACK',
    ],
  },
  {
    title: 'Engagement',
    categories: ['WE_MISS_YOU'],
  },
  {
    title: 'Subscription & billing',
    categories: [
      'SUBSCRIPTION_REMINDER',
      'SUBSCRIPTION_ALERT',
      'PAYMENT_FAILED',
      'PAYMENT_SUCCESS',
    ],
  },
  {
    title: 'Reminders',
    categories: [
      'INCOMPLETE_STORY_REMINDER',
      'DAILY_LISTENING_REMINDER',
      'DAILY_CHALLENGE_REMINDER',
    ],
  },
  {
    title: 'Progress & rewards',
    categories: ['ACHIEVEMENT_UNLOCKED', 'BADGE_EARNED', 'STREAK_MILESTONE'],
  },
];

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

const InboxTab = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const list = await listNotificationsService();
    setNotifications(list);
    setLoading(false);
  }, []);

  useEffect(() => {
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
    <div>
      {notifications.length > 0 && (
        <div className='mb-6 flex justify-end'>
          <button
            type='button'
            onClick={handleMarkAll}
            disabled={marking}
            className='shrink-0 rounded-full border border-[#EC4007] px-5 py-2.5 text-sm font-semibold text-[#EC4007] font-abeezee transition hover:bg-[#FEEAE6] disabled:opacity-50'
          >
            {marking ? 'Marking…' : 'Mark all as read'}
          </button>
        </div>
      )}

      {loading ? (
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
    </div>
  );
};

const BrowserNotificationsRow = () => {
  const { supported, permission, enabled, enabling, enable, disable } =
    useWebPush();
  const blocked = permission === 'denied';

  const description = !supported
    ? 'Not available in this browser'
    : blocked
      ? 'Blocked — allow notifications in your browser settings'
      : 'Get alerts on this device even when Storytime is closed';

  return (
    <div className='flex flex-col gap-3'>
      <h3 className='text-[#221D1D] text-lg not-italic font-bold leading-6 font-qilka'>
        Browser notifications
      </h3>
      <div className='rounded-3xl border border-stone-100 bg-white px-6 py-2 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)]'>
        <div className='flex items-center justify-between gap-4 py-4'>
          <div>
            <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee'>
              Enable browser notifications
            </p>
            <p className='mt-0.5 text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
              {description}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={!supported || blocked || enabling}
            onCheckedChange={(next) => {
              if (next) {
                enable();
              } else {
                disable();
              }
            }}
            className='data-[state=checked]:bg-[#EC4007]'
          />
        </div>
      </div>
    </div>
  );
};

const SettingsTab = () => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchPreferences = async () => {
      setLoading(true);
      const userId = getUserFromStorage()?.id;
      if (!userId) {
        setPreferences([]);
        setLoading(false);
        return;
      }
      const list = await getNotificationPreferencesService(userId);
      setPreferences(list);
      setLoading(false);
    };
    fetchPreferences();
  }, []);

  const handleToggle = async (pref: NotificationPreference) => {
    const nextEnabled = !pref.enabled;
    setPreferences((prev) =>
      prev.map((p) => (p.id === pref.id ? { ...p, enabled: nextEnabled } : p))
    );
    setPendingIds((prev) => [...prev, pref.id]);
    try {
      await updateNotificationPreferenceService(pref.id, nextEnabled);
    } catch (error) {
      setPreferences((prev) =>
        prev.map((p) =>
          p.id === pref.id ? { ...p, enabled: pref.enabled } : p
        )
      );
      toast.error(
        (error as { message?: string })?.message ||
          'Could not update preference'
      );
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== pref.id));
    }
  };

  const visibleCount = preferences.filter(
    (p) => CATEGORY_LABELS[p.category]
  ).length;

  return (
    <div className='flex flex-col gap-8'>
      <BrowserNotificationsRow />

      {loading ? (
        <div className='flex flex-col gap-4'>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className='h-[4rem] animate-pulse rounded-3xl bg-stone-100'
            />
          ))}
        </div>
      ) : visibleCount === 0 ? (
        <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-12 text-center'>
          <p className='text-[#4A413F] font-abeezee'>
            No notification preferences yet.
          </p>
        </div>
      ) : (
        SECTIONS.map((section) => {
          const rows = preferences.filter(
            (p) =>
              section.categories.includes(p.category) &&
              CATEGORY_LABELS[p.category]
          );
          if (rows.length === 0) {
            return null;
          }
          return (
            <div key={section.title} className='flex flex-col gap-3'>
              <h3 className='text-[#221D1D] text-lg not-italic font-bold leading-6 font-qilka'>
                {section.title}
              </h3>
              <div className='rounded-3xl border border-stone-100 bg-white px-6 py-2 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)]'>
                {rows.map((pref, index) => {
                  const isLast = index === rows.length - 1;
                  const channel = CHANNEL_LABELS[pref.type] ?? pref.type;
                  return (
                    <div
                      key={pref.id}
                      className={`flex items-center justify-between gap-4 py-4 ${
                        isLast ? '' : 'border-b border-stone-100'
                      }`}
                    >
                      <div>
                        <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee'>
                          {CATEGORY_LABELS[pref.category]}
                        </p>
                        <p className='mt-0.5 text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
                          {channel}
                        </p>
                      </div>
                      <Switch
                        checked={pref.enabled}
                        disabled={pendingIds.includes(pref.id)}
                        onCheckedChange={() => handleToggle(pref)}
                        className='data-[state=checked]:bg-[#EC4007]'
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

const NotificationPage = () => {
  const [loggedIn, setLoggedIn] = useState(true);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('inbox');

  useEffect(() => {
    setLoggedIn(isUserLoggedIn());
    setCheckedAuth(true);
  }, []);

  const tabButtonClass = (tab: TabKey) => {
    const base =
      'rounded-full px-5 py-2.5 text-sm font-semibold font-abeezee transition';
    if (activeTab === tab) {
      return `${base} bg-[#EC4007] text-white`;
    }
    return `${base} text-[#4A413F] hover:bg-[#FEEAE6]`;
  };

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-4 sm:px-6 md:px-10 py-6 md:py-[2.125rem] w-full max-w-6xl mx-auto my-6 md:my-12'>
      <Header white={false} />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <div className='mb-6'>
          <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
            Notifications
          </h2>
          <p className='text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
            Updates, reminders and preferences from Storytime.
          </p>
        </div>

        {!checkedAuth ? (
          <div className='flex flex-col gap-4'>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className='h-[5rem] animate-pulse rounded-3xl bg-stone-100'
              />
            ))}
          </div>
        ) : !loggedIn ? (
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
        ) : (
          <div>
            <div className='mb-6 inline-flex gap-2 rounded-full bg-[#FAF4F2] p-1'>
              <button
                type='button'
                onClick={() => setActiveTab('inbox')}
                className={tabButtonClass('inbox')}
              >
                Notifications
              </button>
              <button
                type='button'
                onClick={() => setActiveTab('settings')}
                className={tabButtonClass('settings')}
              >
                Settings
              </button>
            </div>

            {activeTab === 'inbox' ? <InboxTab /> : <SettingsTab />}
          </div>
        )}
      </section>
    </div>
  );
};

export default NotificationPage;
