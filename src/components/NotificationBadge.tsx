/**
 * NotificationBadge - Shows unread notification count in sidebar
 * Polls every 30 seconds for updates
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { api } from '@/services/api';

export const NotificationBadge: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const retryDelayRef = useRef(15000);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const schedulePoll = (ms: number) => {
      if (!mountedRef.current) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fetchUnreadCount, ms);
    };

    const fetchUnreadCount = async () => {
      if (!mountedRef.current) return;
      if (!navigator.onLine) {
        schedulePoll(60000);
        return;
      }
      controllerRef.current?.abort();
      controllerRef.current = new AbortController();
      try {
        const response = await api.notifications.getUnreadCount({ signal: controllerRef.current.signal });
        const count = response?.data?.count ?? response?.count ?? 0;
        if (mountedRef.current) setUnreadCount(Number.isFinite(count) ? count : 0);
        retryDelayRef.current = 15000;
        schedulePoll(60000);
      } catch {
        retryDelayRef.current = Math.min(120000, retryDelayRef.current * 2);
        schedulePoll(retryDelayRef.current);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void fetchUnreadCount();

    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative inline-flex">
      <Bell size={20} />
      {!loading && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        </span>
      )}
    </div>
  );
};

export default NotificationBadge;
