import Header from '@/components/header';
import localFont from 'next/font/local';
import { cn } from '@/lib/utils';

const qilka = localFont({
  src: '../Qilka.otf',
  variable: '--font-qilka',
});

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className={cn(
        'bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12',
        qilka.variable
      )}
    >
      <Header />
      {children}
    </div>
  );
};

export default DashboardLayout;
