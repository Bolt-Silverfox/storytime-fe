import localFont from 'next/font/local';

const _qilka = localFont({
  src: '../Qilka.otf',
  variable: '--font-qilka',
});

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return <div>{children}</div>;
};

export default DashboardLayout;
