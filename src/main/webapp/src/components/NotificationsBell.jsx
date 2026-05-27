import React from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/NotificationsContext';

const NotificationsBell = ({ activeTab }) => {
    const { unreadCount } = useNotifications();
    const navigate = useNavigate();
    const isActive = activeTab === 'notifications';

    return (
        <button
            onClick={() => navigate('/notifications')}
            className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                isActive
                    ? 'text-primary bg-primary/10 ring-1 ring-primary/20'
                    : 'text-gray-600 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            aria-label="Notifications"
        >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default NotificationsBell;
