import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Loader2, Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const loadData = async () => {
    try {
      const response = await api.notifications.getAll();
      setNotifications(response.data || []);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.notifications.markAllAsRead();
      await loadData();
    } catch {
      toast.error('Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDismiss = async (id: number) => {
    try {
      await api.notifications.markAsRead(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      toast.error('Failed to dismiss notification');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Notifications</h1>
          <p className="text-muted-foreground">Stay up to date with your college applications</p>
        </div>
        {notifications.length > 0 && (
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            {markingAll && <Loader2 className="animate-spin mr-2" size={16} />}
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-lg">You're all caught up</p>
          <p className="text-muted-foreground/60 text-sm mt-1">No new notifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className="relative flex items-start gap-4 bg-card rounded-lg border border-border p-4 pl-5"
              style={
                !notification.read
                  ? { borderLeft: '4px solid #6C63FF' }
                  : undefined
              }
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{notification.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{notification.message}</p>
                {notification.created_at && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDismiss(notification.id)}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss notification"
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
