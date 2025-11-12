import React from 'react';
import { motion } from 'framer-motion';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  setNotifications: (notifications: AppNotification[]) => void;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, setNotifications, onClose }) => {
  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({...n, read: true})));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="absolute top-16 right-0 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 z-30"
    >
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200">Notifications</h4>
        {notifications.some(n => !n.read) && (
            <button onClick={markAllAsRead} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Mark all as read</button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        {notifications.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No new notifications.</p>
        ) : (
          notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-start gap-3 transition-colors ${!notification.read ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
            >
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!notification.read ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
              <div className="flex-grow">
                <p className="text-sm text-slate-700 dark:text-slate-300">{notification.message}</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(notification.timestamp).toLocaleString()}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

export default NotificationCenter;
