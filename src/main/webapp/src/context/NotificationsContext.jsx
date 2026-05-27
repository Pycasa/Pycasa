import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';

const NotificationsContext = createContext();

export const useNotifications = () => {
    const ctx = useContext(NotificationsContext);
    if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
    return ctx;
};

const WS_URL = `ws://${window.location.host}/ws/notifications`;
const RECONNECT_DELAY_MS = 3000;

// Progress event types — broadcast live but not persisted to DB
const PROGRESS_TYPES = new Set(['scan:progress', 'ai:progress']);

export const NotificationsProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);   // DB-persisted
    const [liveProgress, setLiveProgress] = useState({});     // type -> latest progress event (not in DB)
    const [unreadCount, setUnreadCount] = useState(0);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimer = useRef(null);
    const mountedRef = useRef(true);

    // Load persisted notifications from DB
    const loadFromDb = useCallback(async (search = null, eventType = null) => {
        try {
            const data = await api.notifications.list(search, eventType);
            setNotifications(data || []);
            const unread = (data || []).filter(n => !n.read).length;
            setUnreadCount(unread);
        } catch (e) {
            // silently ignore — server may not be ready yet
        }
    }, []);

    useEffect(() => {
        loadFromDb();
    }, [loadFromDb]);

    // Handle incoming WebSocket event
    const handleEvent = useCallback((event) => {
        if (PROGRESS_TYPES.has(event.type)) {
            // Progress events: update live state only, not DB
            setLiveProgress(prev => ({ ...prev, [event.type]: event }));
        } else {
            // Terminal events clear their corresponding progress entry
            if (event.type === 'scan:completed' || event.type === 'scan:error') {
                setLiveProgress(prev => { const n = { ...prev }; delete n['scan:progress']; return n; });
            }
            if (event.type === 'ai:completed' || event.type === 'ai:error') {
                setLiveProgress(prev => { const n = { ...prev }; delete n['ai:progress']; return n; });
            }

            // Persisted events: prepend to list and bump unread count
            const newNotif = {
                id: `notif_live_${Date.now()}`,
                event_type: event.type,
                message: event.payload?.message || event.type,
                detail: event.payload?.detail || event.payload?.current_file || null,
                ts: event.ts || Date.now(),
                read: false,
            };
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
        }
    }, []);

    const connect = useCallback(() => {
        if (!mountedRef.current) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            if (mountedRef.current) {
                setConnected(true);
                // Clear any stale progress from a previous connection
                setLiveProgress({});
            }
        };

        ws.onmessage = (e) => {
            if (!mountedRef.current) return;
            try { handleEvent(JSON.parse(e.data)); } catch { /* ignore */ }
        };

        ws.onclose = () => {
            if (!mountedRef.current) return;
            setConnected(false);
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        };

        ws.onerror = () => ws.close();
    }, [handleEvent]);

    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, [connect]);

    const markRead = useCallback(async (id) => {
        try {
            await api.notifications.markRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch { /* ignore */ }
    }, []);

    const markAllRead = useCallback(async () => {
        try {
            await api.notifications.markAllRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch { /* ignore */ }
    }, []);

    const deleteOne = useCallback(async (id) => {
        try {
            await api.notifications.delete(id);
            setNotifications(prev => {
                const removed = prev.find(n => n.id === id);
                const next = prev.filter(n => n.id !== id);
                if (removed && !removed.read) setUnreadCount(c => Math.max(0, c - 1));
                return next;
            });
        } catch { /* ignore */ }
    }, []);

    const deleteAll = useCallback(async () => {
        try {
            await api.notifications.deleteAll();
            setNotifications([]);
            setUnreadCount(0);
        } catch { /* ignore */ }
    }, []);

    const refresh = useCallback((search, eventType) => loadFromDb(search, eventType), [loadFromDb]);

    return (
        <NotificationsContext.Provider value={{
            notifications,
            liveProgress,
            unreadCount,
            connected,
            markRead,
            markAllRead,
            deleteOne,
            deleteAll,
            refresh,
        }}>
            {children}
        </NotificationsContext.Provider>
    );
};
