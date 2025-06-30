import { Suspense } from 'react';
import { CreateNewPasswordContent } from './components/create-new-password-content';
import { PageLoader } from '@/components/page-loader';

const Page = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <CreateNewPasswordContent />
    </Suspense>
  );
};

export default Page;
