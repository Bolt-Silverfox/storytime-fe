'use client';

import { cn } from '@/lib/utils';
import { EyeIcon, EyeOff } from 'lucide-react';

interface PasswordInputToggleProps {
  /** Whether the password is currently visible (input type is `text`). */
  visible: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Keyboard-reachable show/hide control for password inputs. Rendered as a real
 * button (always visible, focusable) with an accessible name and pressed state.
 */
export function PasswordInputToggle({
  visible,
  onToggle,
  className,
}: PasswordInputToggleProps) {
  const Icon = visible ? EyeIcon : EyeOff;

  return (
    <button
      type='button'
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible}
      onClick={onToggle}
      className={cn(
        'absolute z-10 right-[15px] -translate-y-1/2 top-1/2 cursor-pointer',
        className
      )}
    >
      <Icon size={20} aria-hidden='true' />
    </button>
  );
}
