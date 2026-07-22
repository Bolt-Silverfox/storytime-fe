'use client';

import { clearUserFromStorage } from '@/lib/services';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

interface ProfileDropdownProps {
  open: boolean;
  onClose: () => void;
}

const menuItems = [
  {
    label: 'Personal settings',
    icon: '/profile.svg',
    link: '/dashboard/personal-settings',
  },
  {
    label: 'Library',
    icon: '/library.svg',
    link: '/library',
  },
  {
    label: 'Security settings',
    icon: '/safe.svg',
    link: '/dashboard/security-settings',
  },
  {
    label: 'Notification',
    icon: '/notification.svg',
    link: '/dashboard/notification',
  },
  {
    label: 'AI Voice selection',
    icon: '/ai-voice.svg',
    link: '/dashboard/ai-voice',
  },
];

export default function ProfileDropdown({
  open,
  onClose,
}: ProfileDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  // Close on Escape.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Move focus to the first menu item on open, restore to the trigger on close.
  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const handleLogout = () => {
    // Clear the auth cookies too (accessToken/refreshToken) — otherwise the
    // route middleware still sees them and bounces /login back to /dashboard.
    clearUserFromStorage();
    localStorage.clear();
    sessionStorage.clear();
    // Full navigation so the middleware re-evaluates with cookies cleared.
    window.location.href = '/login?loggedOut=1';
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className='absolute right-0 mt-2 w-72 border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] rounded-[1.6875rem] border-[0.5px] border-solid z-50'
          onClick={(e) => e.stopPropagation()}
          role='menu'
          aria-label='Profile menu'
        >
          {menuItems.map((item) => (
            <Link
              key={item.label}
              role='menuitem'
              className='flex items-center gap-3 py-6 px-4 hover:bg-gray-50  rounded-[1.6875rem] cursor-pointer transition-colors border-b-[0.5px] border-solid border-stone-100'
              href={item.link}
            >
              <Image src={item.icon} alt='' width={24} height={24} />
              <span className='text-[#4A413F] not-italic leading-6 font-abeezee text-base'>
                {item.label}
              </span>
            </Link>
          ))}
          <button
            role='menuitem'
            className='flex items-center gap-3 py-6 px-4 hover:bg-gray-50  rounded-[1.6875rem] cursor-pointer transition-colors border-b-[0.5px] border-solid border-stone-100 w-full text-left'
            onClick={handleLogout}
            type='button'
          >
            <Image src='/logout.svg' alt='' width={24} height={24} />
            <span className='text-[#4A413F] not-italic leading-6 font-abeezee text-base'>
              Logout
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
