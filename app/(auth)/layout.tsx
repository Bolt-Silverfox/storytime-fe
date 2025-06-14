import { AuthFooter } from './components/auth-footer';
import { AuthNav } from './components/auth-nav';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className='max-w-[1140px] mx-auto px-4 py-12 space-y-8'>
      <AuthNav />
      <div className='space-y-[26px] flex flex-col items-center'>
        <div className='space-y-1.5 text-center'>
          <p className="text-[26px] [font-feature-settings:'liga'_off,_'clig'_off] text-[#221D1D] text-center dark:text-white font-abeezee">
            Hello! 👋 🥰
          </p>
          <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
            Welcome to storytime
          </p>
          <p className='text-[#4A413F] dark:text-white font-abeezee'>
            The worlds first kids story library
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <div className='rounded-[12px] w-[30px] h-1 bg-[#EC4007]' />
          <div className='rounded-[12px] w-[30px] h-1 bg-[#FEEAE6]' />
          <div className='rounded-[12px] w-[30px] h-1 bg-[#FEEAE6]' />
        </div>
      </div>
      {children}
      <AuthFooter />
    </main>
  );
};

export default Layout;
