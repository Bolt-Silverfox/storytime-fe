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

const SITE_TITLE = 'Storytime — Audio stories crafted just for kids';
const SITE_DESCRIPTION =
  'Listen, read, and explore hundreds of interactive, screen-free stories made just for kids — perfect for bedtime and beyond.';

export const metadata: Metadata = {
  // web.storytimeapp.me is the live host (www is not served), so canonical URLs,
  // OG, and the OG image must all resolve here or social previews break.
  metadataBase: new URL('https://web.storytimeapp.me'),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: 'Storytime',
  alternates: { canonical: 'https://web.storytimeapp.me' },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: 'Storytime',
    url: 'https://web.storytimeapp.me',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
        <a
          href='#main'
          className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-abeezee focus:text-[#221D1D] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#EC4007]'
        >
          Skip to content
        </a>
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
