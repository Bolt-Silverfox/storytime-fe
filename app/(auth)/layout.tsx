import type { Metadata } from 'next';
import AuthShell from './auth-shell';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  return <AuthShell>{children}</AuthShell>;
};

export default Layout;
