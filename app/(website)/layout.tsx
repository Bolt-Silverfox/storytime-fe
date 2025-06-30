import { AppNavbar } from '@/components/app-navbar';
import { Footer } from '@/components/footer';
import LenisProvider from '@/components/lenis-provider';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <LenisProvider>
      <div className='relative '>
        <AppNavbar />
        {children}
        <Footer />
      </div>
    </LenisProvider>
  );
};

export default Layout;
