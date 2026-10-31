'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavBody,
  Navbar,
  NavItems,
} from '@/components/ui/resizable-navbar';
import { useAuthState } from '@/lib/use-auth-state';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { ModeToggle } from './mode-toggle';
import { buttonVariants } from './ui/button';
import { ScrollProgress } from './ui/scroll-progress';

export function AppNavbar() {
  // 'unknown' during SSR/hydration: the guest buttons are rendered invisible
  // (same size, so no layout shift) and never shown to a signed-in visitor.
  const auth = useAuthState();
  const loggedIn = auth === 'in';
  const pending = auth === 'unknown';
  const pathname = usePathname();

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
            <ModeToggle />
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
              <div
                className={cn(
                  'flex items-center gap-4',
                  pending && 'invisible'
                )}
                aria-hidden={pending || undefined}
                inert={pending || undefined}
              >
                <Link
                  href='/login'
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'rounded-full bg-transparent border-brand border px-9 h-auto py-4'
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
              </div>
            )}
          </div>
        </NavBody>

        <MobileNav>
          <MobileNavHeader>
            <Logo />
            <div className='flex items-center gap-3'>
              <ModeToggle />
              <MobileNavToggle
                isOpen={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              />
            </div>
          </MobileNavHeader>

          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          >
            <nav aria-label='Mobile' className='flex w-full flex-col gap-4'>
              {navItems.map((item) => (
                <a
                  key={`mobile-link-${item.name}`}
                  href={item.link}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className='relative text-neutral-600 dark:text-body'
                  aria-current={pathname === item.link ? 'page' : undefined}
                >
                  <span className='block'>{item.name}</span>
                </a>
              ))}
            </nav>
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
                <div
                  className={cn('flex flex-col gap-4', pending && 'invisible')}
                  aria-hidden={pending || undefined}
                  inert={pending || undefined}
                >
                  <Link
                    href='/login'
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'rounded-full bg-transparent border-brand border px-9 h-auto py-4'
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
                </div>
              )}
            </div>
          </MobileNavMenu>
        </MobileNav>
      </Navbar>
    </div>
  );
}
