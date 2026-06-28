import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
    startTransition,
} from 'react';
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
const PROGRESS_TYPES = new Set([
    'scan:progress',
    'scan:folder:progress',
    'scan:cancelling',
    'ai:progress',
    'ai:paused',
    'folder-delete:progress',
]);

export const NotificationsProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]); // DB-persisted
    const [liveProgress, setLiveProgress] = useState({}); // type -> latest progress event (not in DB)
    const [unreadCount, setUnreadCount] = useState(0);
    const [connected, setConnected] = useState(false);
    const [scanStatus, setScanStatus] = useState({ is_scanning: false, files_found: 0 });
    const [aiStatus, setAiStatus] = useState({
        is_running: false,
        paused: false,
        processed_files: 0,
        total_files: 0,
        current_file: '',
    });
    // Per-folder scan state: { [folder_id]: { label, scanned, total, current_file } }
    const [folderScans, setFolderScans] = useState({});
    const wsRef = useRef(null);
    const reconnectTimer = useRef(null);
    const mountedRef = useRef(true);

    // Fetch initial statuses when socket connects
    useEffect(() => {
        if (connected) {
            const fetchInitialStatuses = async () => {
                try {
                    const scan = await api.images.getScanStatus();
                    setScanStatus({
                        is_scanning: scan.is_scanning || scan.running,
                        files_found: scan.files_found || scan.scanned,
                    });
                } catch (e) {
                    console.error('Failed to fetch initial scan status:', e);
                }
                try {
                    const ai = await api.ai.getAnalysisStatus();
                    setAiStatus({
                        is_running: ai.is_running || ai.running,
                        paused: ai.paused || false,
                        processed_files: ai.processed_files || ai.analysed,
                        total_files: ai.total_files || ai.total,
                        current_file: ai.current_file || '',
                        db_total: ai.db_total || 0,
                        db_analysed: ai.db_analysed || 0,
                    });
                } catch (e) {
                    console.error('Failed to fetch initial AI status:', e);
                }
            };
            fetchInitialStatuses();
        }
    }, [connected]);

    // Load persisted notifications from DB
    const loadFromDb = useCallback(async (search = null, eventType = null) => {
        try {
            const data = await api.notifications.list(search, eventType);
            setNotifications(data || []);
            const unread = (data || []).filter((n) => !n.read).length;
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
        if (event.type === 'scan:started') {
            setScanStatus({ is_scanning: true, files_found: 0 });
        } else if (event.type === 'scan:progress') {
            setScanStatus({ is_scanning: true, files_found: event.payload.scanned });
        } else if (event.type === 'scan:completed') {
            setScanStatus({ is_scanning: false, files_found: event.payload.total });
        } else if (event.type === 'scan:error') {
            setScanStatus({ is_scanning: false, files_found: 0 });
        } else if (event.type === 'scan:folder:started') {
            // Phase 1 complete — we know the total now
            const { folder_id, folder_label, total } = event.payload;
            if (folder_id) {
                setFolderScans((prev) => ({
                    ...prev,
                    [folder_id]: {
                        label: folder_label || folder_id,
                        scanned: 0,
                        total: total || 0,
                        current_file: '',
                    },
                }));
            }
            setScanStatus((prev) => ({ ...prev, is_scanning: true }));
        } else if (event.type === 'scan:folder:progress') {
            // Per-folder progress → low-priority update, must not block user interaction
            const { folder_id, folder_label, scanned, total, current_file } = event.payload;
            startTransition(() => {
                if (folder_id) {
                    setFolderScans((prev) => ({
                        ...prev,
                        [folder_id]: {
                            label: folder_label || (prev[folder_id]?.label ?? folder_id),
                            scanned: scanned ?? prev[folder_id]?.scanned ?? 0,
                            total: total ?? prev[folder_id]?.total ?? 0,
                            current_file: current_file || '',
                        },
                    }));
                }
                setScanStatus((prev) => ({
                    is_scanning: true,
                    files_found: (prev.files_found || 0) + 1,
                }));
            });
        } else if (
            event.type === 'scan:folder:completed' ||
            event.type === 'scan:folder:complete'
        ) {
            // When a folder scan finishes check if any are still running via liveProgress state
            setScanStatus((prev) => ({
                ...prev,
                // We'll let the terminal clear happen when all folders done
                files_found: prev.files_found || 0,
            }));
            // Dispatch a custom event so other components can react (e.g. refresh image list)
            window.dispatchEvent(
                new CustomEvent('pycasa-scan-completed', { detail: event.payload })
            );
        } else if (event.type === 'scan:folder:error' || event.type === 'scan:folder:cancelled') {
            // No-op for scanStatus; handled below in liveProgress cleanup
        } else if (event.type === 'ai:started') {
            setAiStatus((prev) => ({
                is_running: true,
                processed_files: 0,
                total_files: event.payload.total || 0,
                current_file: '',
                db_total: event.payload.db_total ?? prev.db_total ?? 0,
                db_analysed: event.payload.db_analysed ?? prev.db_analysed ?? 0,
            }));
        } else if (event.type === 'ai:progress') {
            // Low-priority: AI progress must not block user interaction
            startTransition(() => {
                setAiStatus((prev) => ({
                    is_running: true,
                    processed_files: event.payload.analysed,
                    total_files: event.payload.total,
                    current_file: event.payload.current_file || '',
                    db_total: event.payload.db_total ?? prev.db_total ?? 0,
                    db_analysed: event.payload.db_analysed ?? prev.db_analysed ?? 0,
                }));
            });
        } else if (event.type === 'ai:paused') {
            setAiStatus((prev) => ({
                ...prev,
                is_running: false,
                paused: true,
                current_file: '',
                db_total: event.payload.db_total ?? prev.db_total ?? 0,
                db_analysed: event.payload.db_analysed ?? prev.db_analysed ?? 0,
            }));
        } else if (event.type === 'ai:completed' || event.type === 'ai:error') {
            setAiStatus((prev) => ({
                is_running: false,
                paused: false,
                processed_files: 0,
                total_files: 0,
                current_file: '',
                db_total: event.payload.db_total ?? prev.db_total ?? 0,
                db_analysed: event.payload.db_analysed ?? prev.db_analysed ?? 0,
            }));
        }

        if (PROGRESS_TYPES.has(event.type)) {
            // Per-folder progress: key by folder_id so multiple folders can show concurrently
            const key = event.payload?.folder_id
                ? `${event.type}:${event.payload.folder_id}`
                : event.type;
            // Low-priority update — must not block user interactions
            startTransition(() => {
                setLiveProgress((prev) => ({ ...prev, [key]: event }));
            });
        } else {
            // Terminal events clear their corresponding progress entry
            if (event.type === 'scan:completed' || event.type === 'scan:error') {
                setLiveProgress((prev) => {
                    const n = { ...prev };
                    delete n['scan:progress'];
                    return n;
                });
            }
            if (event.type === 'ai:completed' || event.type === 'ai:error') {
                setLiveProgress((prev) => {
                    const n = { ...prev };
                    delete n['ai:progress'];
                    return n;
                });
            }
            if (event.type === 'folder-delete:completed' || event.type === 'folder-delete:error') {
                setLiveProgress((prev) => {
                    const n = { ...prev };
                    delete n['folder-delete:progress'];
                    return n;
                });
            }
            // Clear per-folder scan progress when that folder's scan finishes/cancels/errors
            if (
                [
                    'scan:folder:completed',
                    'scan:folder:complete',
                    'scan:folder:cancelled',
                    'scan:folder:error',
                ].includes(event.type)
            ) {
                const fid = event.payload?.folder_id;
                if (fid) {
                    setLiveProgress((prev) => {
                        const n = { ...prev };
                        delete n[`scan:folder:progress:${fid}`];
                        delete n[`scan:cancelling:${fid}`];
                        // Remove from folderScans too
                        setFolderScans((prevScans) => {
                            const next = { ...prevScans };
                            delete next[fid];
                            return next;
                        });
                        // If no more active folder progress entries remain, clear the navbar pill
                        const hasActive = Object.keys(n).some((k) =>
                            k.startsWith('scan:folder:progress:')
                        );
                        if (!hasActive) {
                            setScanStatus({ is_scanning: false, files_found: 0 });
                        }
                        return n;
                    });
                }
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
            setNotifications((prev) => [newNotif, ...prev]);
            setUnreadCount((prev) => prev + 1);
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
            try {
                handleEvent(JSON.parse(e.data));
            } catch {
                /* ignore */
            }
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
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch {
            /* ignore */
        }
    }, []);

    const markAllRead = useCallback(async () => {
        try {
            await api.notifications.markAllRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch {
            /* ignore */
        }
    }, []);

    const deleteOne = useCallback(async (id) => {
        try {
            await api.notifications.delete(id);
            setNotifications((prev) => {
                const removed = prev.find((n) => n.id === id);
                const next = prev.filter((n) => n.id !== id);
                if (removed && !removed.read) setUnreadCount((c) => Math.max(0, c - 1));
                return next;
            });
        } catch {
            /* ignore */
        }
    }, []);

    const deleteAll = useCallback(async () => {
        try {
            await api.notifications.deleteAll();
            setNotifications([]);
            setUnreadCount(0);
        } catch {
            /* ignore */
        }
    }, []);

    const refresh = useCallback((search, eventType) => loadFromDb(search, eventType), [loadFromDb]);

    return (
        <NotificationsContext.Provider
            value={{
                notifications,
                liveProgress,
                folderScans,
                unreadCount,
                connected,
                scanStatus,
                aiStatus,
                markRead,
                markAllRead,
                deleteOne,
                deleteAll,
                refresh,
            }}
        >
            {children}
        </NotificationsContext.Provider>
    );
};
