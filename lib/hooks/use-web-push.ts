'use client';

import {
  deletePushToken,
  isPushConfigured,
  onForegroundPush,
  requestPushPermissionAndToken,
} from '@/lib/firebase-messaging';
import {
  registerWebPushTokenService,
  unregisterWebPushTokenService,
} from '@/lib/services';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const STORAGE_KEY = 'webPushToken';

type PermissionState = NotificationPermission | 'unsupported';

const readStoredToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export interface UseWebPush {
  // Whether this browser can receive web push AND config is present.
  supported: boolean;
  // Current Notification permission ('default' | 'granted' | 'denied' |
  // 'unsupported').
  permission: PermissionState;
  // Whether a token is currently registered for this browser.
  enabled: boolean;
  // Whether an enable/disable request is in flight.
  enabling: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export function useWebPush(): UseWebPush {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('default');
  const [enabled, setEnabled] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Subscribe to foreground pushes while enabled; surface them as toasts.
  const subscribeForeground = useCallback(() => {
    if (unsubscribeRef.current) {
      return;
    }
    unsubscribeRef.current = onForegroundPush((payload) => {
      const title = payload.notification?.title;
      const body = payload.notification?.body;
      if (title) {
        toast(title, body ? { description: body } : undefined);
      } else if (body) {
        toast(body);
      }
    });
  }, []);

  useEffect(() => {
    const browserSupportsPush =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator;
    const isSupported = browserSupportsPush && isPushConfigured;
    setSupported(isSupported);

    if (!browserSupportsPush) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);

    if (
      isSupported &&
      readStoredToken() &&
      Notification.permission === 'granted'
    ) {
      setEnabled(true);
      subscribeForeground();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [subscribeForeground]);

  const enable = useCallback(async () => {
    if (!supported || enabling) {
      return;
    }
    setEnabling(true);
    try {
      const token = await requestPushPermissionAndToken();
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission);
      }
      if (!token) {
        toast.error('Could not enable browser notifications');
        return;
      }
      await registerWebPushTokenService(token);
      try {
        localStorage.setItem(STORAGE_KEY, token);
      } catch {
        // Ignore storage failures; the token is still registered server-side.
      }
      setEnabled(true);
      subscribeForeground();
      toast.success('Browser notifications enabled');
    } catch (error) {
      toast.error(
        (error as { message?: string })?.message ||
          'Could not enable browser notifications'
      );
    } finally {
      setEnabling(false);
    }
  }, [supported, enabling, subscribeForeground]);

  const disable = useCallback(async () => {
    if (enabling) {
      return;
    }
    setEnabling(true);
    try {
      const token = readStoredToken();
      if (token) {
        try {
          await unregisterWebPushTokenService(token);
        } catch {
          // Best-effort: still clear the local token below.
        }
      }
      await deletePushToken();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setEnabled(false);
      toast.success('Browser notifications disabled');
    } catch (error) {
      toast.error(
        (error as { message?: string })?.message ||
          'Could not disable browser notifications'
      );
    } finally {
      setEnabling(false);
    }
  }, [enabling]);

  return { supported, permission, enabled, enabling, enable, disable };
}
