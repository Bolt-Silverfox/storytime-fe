'use client';
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  NavbarButton,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from '@/components/ui/resizable-navbar';
import { useState } from 'react';
import { ScrollProgress } from './ui/scroll-progress';
import { Logo } from './logo';
import { Button } from './ui/button';

export function AppNavbar() {
  const navItems = [
    {
      name: 'Home',
      link: '#features',
    },
    {
      name: 'About',
      link: '#pricing',
    },
    {
      name: 'Contact',
      link: '#contact',
    },
    {
      name: 'FAQ',
      link: '#contact',
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
          <div className='flex items-center gap-4'>
            <Button
              variant='outline'
              className='rounded-full bg-transparent border-[#EC4007] border px-9 h-auto py-4'
            >
              Login
            </Button>
            <Button
              variant='primary'
              type='submit'
              className='px-9 h-auto py-4'
            >
              Get started
            </Button>
          </div>
        </NavBody>

        <MobileNav>
          <MobileNavHeader>
            <NavbarLogo />
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
          </MobileNavHeader>

          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          >
            {navItems.map((item, idx) => (
              <a
                key={`mobile-link-${idx}`}
                href={item.link}
                onClick={() => setIsMobileMenuOpen(false)}
                className='relative text-neutral-600 dark:text-neutral-300'
              >
                <span className='block'>{item.name}</span>
              </a>
            ))}
            <div className='flex w-full flex-col gap-4'>
              <NavbarButton
                onClick={() => setIsMobileMenuOpen(false)}
                variant='primary'
                className='w-full'
              >
                Login
              </NavbarButton>
              <NavbarButton
                onClick={() => setIsMobileMenuOpen(false)}
                variant='primary'
                className='w-full'
              >
                Book a call
              </NavbarButton>
            </div>
          </MobileNavMenu>
        </MobileNav>
      </Navbar>
    </div>
  );
}
