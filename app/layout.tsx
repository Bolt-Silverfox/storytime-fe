import type { Metadata } from 'next';
import { ABeeZee } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import localFont from 'next/font/local';
import { Providers } from './providers';

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
  metadataBase: new URL('https://www.storytimeapp.me'),
  title: 'Storytime',
  description: 'Storytime is a platform for children to read stories.',
  openGraph: {
    title: 'Storytime',
    description: 'Listen, read, and explore stories crafted just for kids.',
    siteName: 'Storytime',
    url: 'https://www.storytimeapp.me',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Storytime',
    description: 'Listen, read, and explore stories crafted just for kids.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={cn(abeezee.variable, qilka.variable, 'antialiased')}>
        <ThemeProvider
          attribute='class'
          defaultTheme='light'
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
