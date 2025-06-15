import { AuthNav } from './register/components/auth-nav';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className='max-w-[1140px] h-full mx-auto px-4 py-12 space-y-8'>
      <AuthNav />
      {children}
    </main>
  );
};

export default Layout;
