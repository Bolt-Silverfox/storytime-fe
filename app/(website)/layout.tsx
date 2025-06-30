import { AppNavbar } from '@/components/app-navbar';
import { Footer } from '@/components/footer';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className='relative '>
      <AppNavbar />
      {children}
      <Footer />
    </div>
  );
};

export default Layout;
