import Header from '@/components/header';
import localFont from 'next/font/local';
import { cn } from '@/lib/utils';

const qilka = localFont({
  src: '../Qilka.otf',
  variable: '--font-qilka',
});

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return <div>{children}</div>;
};

export default DashboardLayout;
