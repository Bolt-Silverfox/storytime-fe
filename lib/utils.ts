import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const maskEmail = (email: string) => {
  const [localPart, domain] = email.split('@');

  if (localPart.length <= 4) {
    return `${localPart[0]}*****@${domain}`;
  }

  const visiblePart = localPart.slice(0, localPart.lastIndexOf('.') + 4); // eg. "felicia.akin"
  return `${visiblePart}*****@${domain}`;
};
