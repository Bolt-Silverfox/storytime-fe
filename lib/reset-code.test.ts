import { describe, expect, it } from 'vitest';
import {
  RESET_CODE_LENGTH,
  ResetCodeSchema,
  sanitizeResetCode,
} from './reset-code';

describe('ResetCodeSchema', () => {
  it.each(['123456', '12345678', '000123', '00012345'])('accepts %s', (v) => {
    expect(ResetCodeSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    '',
    '12345',
    '1234567',
    '123456789',
    '12345a',
    '1234 567',
    ' 123456',
  ])('rejects %j', (v) => {
    expect(ResetCodeSchema.safeParse(v).success).toBe(false);
  });

  it('rejects with a message naming both lengths', () => {
    const r = ResetCodeSchema.safeParse('1234567');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/6 or 8 digits/);
  });

  it('exposes 8 as the slot count', () => {
    expect(RESET_CODE_LENGTH).toBe(8);
  });
});

describe('sanitizeResetCode', () => {
  it('strips whitespace and non-digits, keeping leading zeros', () => {
    expect(sanitizeResetCode(' 00 12-34\n56 ')).toBe('00123456');
  });

  it('caps at 8 digits', () => {
    expect(sanitizeResetCode('1234567890')).toBe('12345678');
  });

  it('returns an empty string for no digits', () => {
    expect(sanitizeResetCode('abc')).toBe('');
  });
});
