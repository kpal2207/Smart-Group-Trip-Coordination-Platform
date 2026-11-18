import React, { useState, useEffect, useRef, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/expense';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../utils/supabase';

const NotificationCenter = () => {
  const { user } = useContext(AuthContext);
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => getNotifications().then((res) => res.data || []),
    enabled: !!user?.id,
  });

  // Real-time Supabase push subscription (replaces 15-second polling)
  useEffect(() => {
    if (!supabase || !user?.id) return;
    const channel = supabase
      .channel(`notifs:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e) => containerRef.current && !containerRef.current.contains(e.target) && setIsOpen(false);
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) refetch();
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const handleItemClick = async (notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id);
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    }
  };

  return (
    <div className="notification-container" ref={containerRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ position: 'relative', padding: '6px 10px', display: 'inline-flex', alignItems: 'center' }}
        onClick={handleToggle}
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications ({unreadCount} new)</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-text"
                style={{ fontSize: '0.75rem', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                onClick={handleMarkAllRead}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => handleItemClick(n)}
                  style={{ cursor: 'pointer' }}
                >
                  <p style={{ margin: 0, lineHeight: 1.3 }}>{n.message}</p>
                  <div className="notif-time">
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull;{' '}
                    {new Date(n.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
