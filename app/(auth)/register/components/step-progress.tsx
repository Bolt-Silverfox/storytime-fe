'use client';

import { useAuth } from '@/context/auth-context';
import { registrationSteps } from '@/lib/data';

export const StepProgress = () => {
  const { registrationStep } = useAuth();

  const progressClasses = (currentStep: string) => {
    const currentIndex = registrationSteps.indexOf(currentStep);
    const activeIndex = registrationSteps.indexOf(registrationStep);

    return `rounded-[12px] w-[30px] h-1 ${
      currentIndex <= activeIndex ? 'bg-[#EC4007]' : 'bg-[#FEEAE6]'
    }`;
  };

  return (
    <div className='flex items-center gap-3'>
      {registrationSteps.map((step) => (
        <div key={step} className={progressClasses(step)} />
      ))}
    </div>
  );
};
