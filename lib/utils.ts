import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import countries from 'world-countries';
import ISO6391 from 'iso-639-1';
import { faker } from '@faker-js/faker';

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

export function getFirstName(fullName?: string | null): string {
  if (!fullName || typeof fullName !== 'string') {
    return '';
  }
  return fullName.trim().split(' ')[0];
}

export const countryOptions = [
  { value: 'US', label: 'United States' },
  ...countries
    .filter((c) => c.cca2 !== 'US')
    .map((c) => ({
      value: c.cca2,
      label: c.name.common,
    })),
];

export const languageOptions = [
  { value: 'en', label: 'English' },
  ...ISO6391.getAllNames()
    .filter((name) => ISO6391.getCode(name) !== 'en')
    .map((name) => ({
      value: ISO6391.getCode(name),
      label: name,
    })),
];

export const kidsOptions = Array.from({ length: 6 }, (_, i) => {
  const count = i + 1;
  return {
    value: count.toString(),
    label: `${count} kid${count > 1 ? 's' : ''}`,
  };
});

export const ageRangesOptions = () => {
  const ranges: { label: string; value: string }[] = [];
  let start = 2;

  while (start < 13) {
    const end = Math.min(start + 2, 13);
    ranges.push({
      value: `${start}-${end}`,
      label: `${start} - ${end} yrs`,
    });
    start = end;
  }

  return ranges;
};

export const avatarOptions = Array.from({ length: 6 }, () => ({
  avatar: faker.image.avatar(),
  name: faker.person.firstName(),
}));
