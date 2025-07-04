'use client';

import type { RegistrationData } from '@/types/auth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type RegistrationStep = 'details' | 'credentials' | 'verify';

export type KidsInfo = {
  name: string;
  ageRange: string;
  avatar: string;
};

type AuthContextValue = {
  registrationData: RegistrationData | null;
  registrationStep: RegistrationStep;
  setRegistrationData: (data: RegistrationData | null) => void;
  handleRegistrationStepForward: (step: RegistrationStep) => void;
  handleRegistrationStepBackward: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const storageKey = 'root:auth';

const getInitialState = (searchParams: URLSearchParams) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  }
  return {
    registrationData: null,
    registrationStep:
      (searchParams.get('step') as RegistrationStep) || 'details',
  };
};

const AuthContextProvider = ({ children }: { children: React.ReactNode }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [registrationData, setRegistrationData] =
    useState<RegistrationData | null>(null);
  const registrationSteps: RegistrationStep[] = [
    'details',
    'credentials',
    'verify',
  ];

  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>(
    () => getInitialState(searchParams).registrationStep
  );

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      setRegistrationData(parsed.registrationData);
      setRegistrationStep(parsed.registrationStep);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ registrationData, registrationStep })
    );
  }, [registrationData, registrationStep]);

  useEffect(() => {
    const urlStep = searchParams.get('step') as RegistrationStep;
    if (urlStep && urlStep !== registrationStep) {
      setRegistrationStep(urlStep);
    }
  }, [searchParams, registrationStep]);

  useEffect(() => {
    if (!registrationData) {
      handleRegistrationStepForward('details');
      return;
    }

    if (
      (registrationStep === 'credentials' || registrationStep === 'verify') &&
      !(registrationData.title && registrationData.name)
    ) {
      handleRegistrationStepForward('details');
    }

    if (registrationStep === 'verify' && !registrationData.email) {
      handleRegistrationStepForward('credentials');
    }
  }, [registrationData, registrationStep]);

  const handleRegistrationStepForward = useCallback(
    (step: RegistrationStep) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', step);
      router.push(`${pathname}?${params.toString()}`);
      setRegistrationStep(step);
    },
    [pathname, router, searchParams]
  );

  const handleRegistrationStepBackward = useCallback(() => {
    const currentIndex = registrationSteps.indexOf(registrationStep);
    if (currentIndex > 0) {
      handleRegistrationStepForward(registrationSteps[currentIndex - 1]);
    }
  }, [registrationStep, handleRegistrationStepForward]);

  const value = useMemo(
    () => ({
      registrationData,
      registrationStep,
      setRegistrationData,
      handleRegistrationStepForward,
      handleRegistrationStepBackward,
    }),
    [
      registrationData,
      registrationStep,
      handleRegistrationStepForward,
      handleRegistrationStepBackward,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthContextProvider');
  }
  return ctx;
};

export default AuthContextProvider;
