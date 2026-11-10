import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/lib/axios', () => ({ default: { post } }));

import { resetPasswordService, validateResetTokenService } from './services';

describe('reset code payloads', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { message: 'ok' } });
  });

  it.each(['000123', '00012345', '12345678'])(
    'validate-reset-token sends %s as a string',
    async (token) => {
      await validateResetTokenService({ token, email: 'a@b.co' });
      const body = post.mock.calls[0][1];
      expect(post.mock.calls[0][0]).toBe('auth/validate-reset-token');
      expect(body.token).toBe(token);
      expect(JSON.parse(JSON.stringify(body)).token).toBe(token);
    }
  );

  it.each(['000123', '00012345'])(
    'reset-password sends %s as a string',
    async (token) => {
      await resetPasswordService({
        token,
        email: 'a@b.co',
        newPassword: 'Passw0rd!',
      });
      const body = post.mock.calls[0][1];
      expect(post.mock.calls[0][0]).toBe('auth/reset-password');
      expect(typeof body.token).toBe('string');
      expect(JSON.parse(JSON.stringify(body)).token).toBe(token);
    }
  );
});
