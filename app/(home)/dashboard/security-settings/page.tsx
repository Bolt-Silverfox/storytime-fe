'use client';

import BackButton from '@/components/back-button';
import Header from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePasswordService, isUserLoggedIn } from '@/lib/services';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const isStrongPassword = (password: string) => {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
};

const SecuritySettingsPage = () => {
  const [loggedIn, setLoggedIn] = useState(true);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isUserLoggedIn()) {
      setLoggedIn(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      toast.error('Enter your current password');
      return;
    }
    if (!isStrongPassword(newPassword)) {
      toast.error(
        'New password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a symbol.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await changePasswordService(oldPassword, newPassword);
      toast.success('Password changed');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(
        (error as { message?: string })?.message || 'Could not change password'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'>
      <Header white={false} />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
          Security settings
        </h2>
        <p className='mb-6 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          Update the password you use to sign in.
        </p>

        {!loggedIn ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              Log in to change your password.
            </p>
            <Link
              href='/login'
              className='mt-4 inline-block rounded-2xl bg-[#EC4007] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
            >
              Log in
            </Link>
          </div>
        ) : (
          <form
            className='flex max-w-md flex-col gap-6'
            onSubmit={handleSubmit}
          >
            <div>
              <label
                htmlFor='current-password'
                className='block mb-1 text-[#4A413F] text-sm font-abeezee'
              >
                Current password
              </label>
              <Input
                id='current-password'
                type='password'
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder='Enter your current password'
                autoComplete='current-password'
              />
            </div>
            <div>
              <label
                htmlFor='new-password'
                className='block mb-1 text-[#4A413F] text-sm font-abeezee'
              >
                New password
              </label>
              <Input
                id='new-password'
                type='password'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder='Enter a new password'
                autoComplete='new-password'
              />
              <p className='mt-1 text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
                At least 8 characters with uppercase, lowercase, a number, and a
                symbol.
              </p>
            </div>
            <div>
              <label
                htmlFor='confirm-password'
                className='block mb-1 text-[#4A413F] text-sm font-abeezee'
              >
                Confirm new password
              </label>
              <Input
                id='confirm-password'
                type='password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder='Re-enter your new password'
                autoComplete='new-password'
              />
            </div>
            <Button
              type='submit'
              variant='primary'
              className='w-fit px-12'
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
};

export default SecuritySettingsPage;
