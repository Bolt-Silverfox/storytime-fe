import { AxiosError } from 'axios';
import Cookies from 'js-cookie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/axios', () => ({ default: { post: mocks.post } }));

import {
  passwordlessConsumeService,
  passwordlessRequestService,
  passwordlessVerifyService,
} from './services';

describe('passwordless services', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    localStorage.clear();
    for (const name of Object.keys(Cookies.get())) {
      Cookies.remove(name);
    }
  });

  it('request posts only the email and returns the timing payload', async () => {
    const data = {
      message: 'ok',
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    };
    mocks.post.mockResolvedValueOnce({ data });
    await expect(passwordlessRequestService('a@b.co')).resolves.toEqual(data);
    expect(mocks.post).toHaveBeenCalledWith('auth/passwordless/request', {
      email: 'a@b.co',
    });
  });

  it('verify omits the guest header without a guest cookie and sets the session', async () => {
    mocks.post.mockResolvedValueOnce({
      data: { jwt: 'j', refreshToken: 'r', user: { id: 'u' }, isNewUser: true },
    });
    const res = await passwordlessVerifyService('a@b.co', '123456');
    expect(res.isNewUser).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith(
      'auth/passwordless/verify',
      { email: 'a@b.co', code: '123456' },
      undefined
    );
    expect(Cookies.get('accessToken')).toBe('j');
  });

  it('consume normalises 400 and network errors without leaking the token', async () => {
    mocks.post.mockRejectedValueOnce(
      new AxiosError('boom', 'ERR_BAD_REQUEST', undefined, {}, {
        status: 400,
        data: { message: 'Invalid or expired code' },
      } as never)
    );
    await expect(
      passwordlessConsumeService('T'.repeat(43))
    ).rejects.toMatchObject({ status: 400 });
    mocks.post.mockRejectedValueOnce(
      new AxiosError('Network Error', 'ERR_NETWORK', undefined, {})
    );
    await expect(
      passwordlessConsumeService('T'.repeat(43))
    ).rejects.toMatchObject({ status: null });
  });
});
