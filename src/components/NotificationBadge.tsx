/**
 * NotificationBadge - Shows unread notification count in sidebar
 * Polls every 30 seconds for updates
 */

import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { api } from '@/services/api';

export const NotificationBadge: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUnreadCount();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.notifications.getUnreadCount();
      if (response.success || response.data !== undefined) {
        const count = response.data?.count ?? response.count ?? 0;
        setUnreadCount(count);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    } finally {
      setLoading(false);
    }
  };

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
