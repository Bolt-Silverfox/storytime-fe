'use client';

import AuthContextProvider from '@/context/auth-context';
import { AuthNav } from './register/components/auth-nav';
import { Suspense } from 'react';
import { PageLoader } from '@/components/page-loader';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthContextProvider>
        <main className='max-w-[1140px] h-full mx-auto px-4 py-12 space-y-8'>
          <AuthNav />
          {children}
        </main>
      </AuthContextProvider>
    </Suspense>
  );
};

export default Layout;
