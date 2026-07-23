'use client';

import { cancelFrame, frame } from 'framer-motion';
import { ReactLenis } from 'lenis/react';
import type { LenisRef } from 'lenis/react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Framer Motion의 단일 RAF 루프에 Lenis.raf() 훅킹
  useEffect(() => {
    if (!mounted || reducedMotion) {
      return;
    }
    const unsubscribe = frame.update(({ timestamp }) => {
      lenisRef.current?.lenis?.raf(timestamp);
    }, /* immediate */ true);
    return () => {
      cancelFrame(unsubscribe);
    };
  }, [mounted, reducedMotion]);

  // 경로 변경 시 스크롤 최상단으로 리셋
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is intentionally used as a trigger to scroll to top on route change
  useEffect(() => {
    if (!mounted || reducedMotion) {
      return;
    }
    lenisRef.current?.lenis?.scrollTo(0, { immediate: true });
  }, [pathname, mounted, reducedMotion]);

  // SSR 시엔 Lenis 감싸지 않고 바로 렌더. 사용자가 모션 감소를 선호하면 Lenis의
  // 부드러운 스크롤을 비활성화하고 네이티브 스크롤을 사용한다.
  if (!mounted || reducedMotion) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      ref={lenisRef}
      root
      options={{
        duration: 1.7,
        smoothWheel: true,
        autoRaf: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
