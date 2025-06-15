import type { Metadata } from 'next';
import { ABeeZee } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import localFont from 'next/font/local';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import AuthContextProvider from '@/context/auth-context';

const abeezee = ABeeZee({
  variable: '--font-abeezee',
  subsets: ['latin'],
  weight: '400',
});

const qilka = localFont({
  src: './Qilka.otf',
  variable: '--font-qilka',
});

export const metadata: Metadata = {
  title: 'Storytime',
  description: 'Storytime is a platform for children to read stories.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={cn(
          abeezee.variable,
          qilka.variable,
          'antialiased',
          'bg-[#FAF4F2]'
        )}
      >
        <ThemeProvider
          attribute='class'
          defaultTheme='light'
          enableSystem
          disableTransitionOnChange
        >
          <AuthContextProvider>{children}</AuthContextProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
