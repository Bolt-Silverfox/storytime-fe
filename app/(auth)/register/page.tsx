'use client';

import { EmptyStates } from '@/components/ui/empty-states';
import { useAuth } from '@/context/auth-context';
import { isUserLoggedIn } from '@/lib/services';
import { getFirstName } from '@/lib/utils';
import { IconMoodSad } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'framer-motion';
import { StepBack } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';
import { AuthFooter } from './components/auth-footer';
import { CredentialsStep } from './components/registration-steps/credentials-step';
import { DetailsStep } from './components/registration-steps/details-step';
import { VerifyStep } from './components/registration-steps/verify-step';
import { StepBackButton } from './components/step-back';
import { StepProgress } from './components/step-progress';

const stepComponents = {
  details: DetailsStep,
  credentials: CredentialsStep,
  verify: VerifyStep,
} as const;

const RegisterPage = () => {
  const router = useRouter();
  const {
    registrationStep,
    handleRegistrationStepForward,
    handleRegistrationStepBackward,
    registrationData,
  } = useAuth();

  // Redirect already-authenticated users away from the register page. A dead
  // session has its cookies cleared by the axios refresh interceptor, so
  // isUserLoggedIn() is false and the form renders normally.
  useEffect(() => {
    if (isUserLoggedIn()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const StepComponent =
    stepComponents[registrationStep as keyof typeof stepComponents];
  return (
    <>
      <div className='space-y-8'>
        <div className='space-y-[26px] flex flex-col items-center'>
          <div className='space-y-1.5 text-center w-full'>
            <div className='relative'>
              <StepBackButton onClick={handleRegistrationStepBackward} />
              <p className="text-[26px] [font-feature-settings:'liga'_off,_'clig'_off] text-[#221D1D] text-center dark:text-white font-abeezee">
                Hello! {getFirstName(registrationData?.name)}👋 🥰
              </p>
              <div />
            </div>
            <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
              Welcome to storytime
            </p>
            <p className='text-[#4A413F] dark:text-white font-abeezee'>
              The worlds first kids story library
            </p>
          </div>
          <StepProgress />
        </div>
        <AnimatePresence mode='wait'>
          {StepComponent ? (
            <motion.div
              key={registrationStep}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className='w-full'
            >
              <StepComponent />
            </motion.div>
          ) : (
            <motion.p
              key='invalid'
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className='text-center text-destructive font-medium'
            >
              <EmptyStates>
                <React.Fragment>
                  <EmptyStates.Icon icon={IconMoodSad}>
                    This Registration step does not exist.
                  </EmptyStates.Icon>
                  <EmptyStates.Button
                    onClick={() => handleRegistrationStepForward('details')}
                  >
                    <StepBack className='size-5' />
                    Restart registration
                  </EmptyStates.Button>
                </React.Fragment>
              </EmptyStates>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <AuthFooter />
    </>
  );
};

export default RegisterPage;
