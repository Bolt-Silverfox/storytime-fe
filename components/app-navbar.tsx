'use client';
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavBody,
  NavItems,
  Navbar,
} from '@/components/ui/resizable-navbar';
import { isUserLoggedIn } from '@/lib/services';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from './logo';
import { buttonVariants } from './ui/button';
import { ScrollProgress } from './ui/scroll-progress';

export function AppNavbar() {
  // Reflect auth state so a signed-in visitor sees "Go to app" instead of
  // Login/Get started. Read after mount to avoid an SSR/client hydration
  // mismatch (both render logged-out first, then this updates).
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLoggedIn(isUserLoggedIn());
  }, []);

  const navItems = [
    {
      name: 'Home',
      link: '/',
    },
    {
      name: 'About',
      link: '/about',
    },
    {
      name: 'Contact',
      link: '/contact',
    },
    {
      name: 'FAQ',
      link: '/faq',
    },
  ];

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className='relative w-full'>
      <Navbar className='fixed top-5 inset-x-0 mx-auto z-50'>
        <NavBody visible={true}>
          <ScrollProgress className='top-[-5px]' />
          <Logo />
          <NavItems items={navItems} />
          <div className='flex items-center gap-4 relative'>
            {loggedIn ? (
              <Link
                href='/dashboard'
                className={cn(
                  buttonVariants({ variant: 'primary' }),
                  'px-9 h-auto py-4'
                )}
              >
                Go to app
              </Link>
            ) : (
              <>
                <Link
                  href='/login'
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'rounded-full bg-transparent border-[#EC4007] border px-9 h-auto py-4'
                  )}
                >
                  Login
                </Link>
                <Link
                  href='/register'
                  className={cn(
                    buttonVariants({ variant: 'primary' }),
                    'px-9 h-auto py-4'
                  )}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </NavBody>

        <MobileNav>
          <MobileNavHeader>
            <Logo />
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
          </MobileNavHeader>

          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          >
            {navItems.map((item) => (
              <a
                key={`mobile-link-${item.name}`}
                href={item.link}
                onClick={() => setIsMobileMenuOpen(false)}
                className='relative text-neutral-600 dark:text-neutral-300'
              >
                <span className='block'>{item.name}</span>
              </a>
            ))}
            <div className='flex w-full flex-col gap-4'>
              {loggedIn ? (
                <Link
                  href='/dashboard'
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    buttonVariants({ variant: 'primary' }),
                    'px-9 h-auto py-4'
                  )}
                >
                  Go to app
                </Link>
              ) : (
                <>
                  <Link
                    href='/login'
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'rounded-full bg-transparent border-[#EC4007] border px-9 h-auto py-4'
                    )}
                  >
                    Login
                  </Link>
                  <Link
                    href='/register'
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      buttonVariants({ variant: 'primary' }),
                      'px-9 h-auto py-4'
                    )}
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </MobileNavMenu>
        </MobileNav>
      </Navbar>
    </div>
  );
}
