'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { DetailsStep } from './components/registration-steps/details-step';
import { CredentialsStep } from './components/registration-steps/credentials-step';
import { VerifyStep } from './components/registration-steps/verify-step';
import { IconMoodSad } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'framer-motion';
import { EmptyStates } from '@/components/ui/empty-states';
import { StepBack } from 'lucide-react';
import { StepProgress } from './components/step-progress';
import { StepBackButton } from './components/step-back';
import { AuthFooter } from './components/auth-footer';

const stepComponents = {
  details: DetailsStep,
  credentials: CredentialsStep,
  verify: VerifyStep,
} as const;

const Page = () => {
  const {
    registrationStep,
    handleRegistrationStepForward,
    handleRegistrationStepBackward,
  } = useAuth();
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
                Hello! 👋 🥰
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

export default Page;
