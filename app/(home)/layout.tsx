import type { Metadata } from 'next';
import localFont from 'next/font/local';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const _qilka = localFont({
  src: '../Qilka.otf',
  variable: '--font-qilka',
});

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return <div>{children}</div>;
};

export default DashboardLayout;
