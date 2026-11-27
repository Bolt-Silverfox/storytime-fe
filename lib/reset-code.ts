import { z } from 'zod';

export const RESET_CODE_LENGTH = 8;

export const ResetCodeSchema = z
  .string()
  .regex(/^(\d{6}|\d{8})$/, 'Enter the 6 or 8 digits from your email.');

export const sanitizeResetCode = (value: string) =>
  value.replace(/\D/g, '').slice(0, RESET_CODE_LENGTH);
