'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

/** Compact Light / System / Dark menu for headers and navbars. */
export function ModeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const TriggerIcon = mounted && resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label='Change colour theme'
        className={cn(
          'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-[0.5px] border-solid border-hairline bg-surface text-body transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          className
        )}
      >
        <TriggerIcon className='size-5' aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuRadioGroup
          value={mounted ? (theme ?? 'system') : 'system'}
          onValueChange={setTheme}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden='true' />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Segmented Light / System / Dark control for the settings page. */
export function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? 'system') : 'system';

  return (
    <div
      role='radiogroup'
      aria-label='Colour theme'
      className='inline-flex rounded-full border border-solid border-hairline bg-sunken p-1'
    >
      {THEME_OPTIONS.map(({ value, label, Icon }, index) => {
        const active = current === value;
        return (
          <button
            key={value}
            type='button'
            role='radio'
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setTheme(value)}
            onKeyDown={(e) => {
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!step) {
                return;
              }
              e.preventDefault();
              const next =
                THEME_OPTIONS[
                  (index + step + THEME_OPTIONS.length) % THEME_OPTIONS.length
                ];
              setTheme(next.value);
              const buttons =
                e.currentTarget.parentElement?.querySelectorAll('button');
              buttons?.[THEME_OPTIONS.indexOf(next)]?.focus();
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 font-abeezee text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              active ? 'bg-brand text-white' : 'text-body hover:bg-tint'
            )}
          >
            <Icon className='size-4' aria-hidden='true' />
            {label}
          </button>
        );
      })}
    </div>
  );
}
