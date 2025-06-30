import { AppNavbar } from '@/components/app-navbar';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className='relative '>
      <AppNavbar />

      {children}
    </div>
  );
};

export default Layout;
