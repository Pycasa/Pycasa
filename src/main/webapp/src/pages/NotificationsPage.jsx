import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import {
    Bell, CheckCheck, Trash2, Wifi, WifiOff, Search, X,
    ScanLine, CheckCircle2, AlertCircle, Loader2, Sparkles, Filter
} from 'lucide-react';
import { useNotifications } from '@/context/NotificationsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ─── Event metadata ───────────────────────────────────────────────────────────
const EVENT_META = {
    'scan:started':   { icon: ScanLine,     color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/40',     border: 'border-blue-100 dark:border-blue-900/60',     label: 'Scan started',          category: 'scan' },
    'scan:progress':  { icon: Loader2,      color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-100 dark:border-indigo-900/60', label: 'Scanning',              category: 'scan' },
    'scan:completed': { icon: CheckCircle2, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950/40',   border: 'border-green-100 dark:border-green-900/60',   label: 'Scan complete',         category: 'scan' },
    'scan:error':     { icon: AlertCircle,  color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/40',       border: 'border-red-100 dark:border-red-900/60',       label: 'Scan error',            category: 'scan' },
    'ai:started':     { icon: Sparkles,     color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-100 dark:border-purple-900/60', label: 'AI analysis started',   category: 'ai'   },
    'ai:progress':    { icon: Loader2,      color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-100 dark:border-indigo-900/60', label: 'Analysing',             category: 'ai'   },
    'ai:completed':   { icon: CheckCircle2, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950/40',   border: 'border-green-100 dark:border-green-900/60',   label: 'AI analysis complete',  category: 'ai'   },
    'ai:error':       { icon: AlertCircle,  color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/40',       border: 'border-red-100 dark:border-red-900/60',       label: 'AI error',              category: 'ai'   },
};

const FILTER_OPTIONS = [
    { value: '',             label: 'All' },
    { value: 'scan:started',   label: 'Scan started' },
    { value: 'scan:completed', label: 'Scan complete' },
    { value: 'scan:error',     label: 'Scan error' },
    { value: 'ai:started',     label: 'AI started' },
    { value: 'ai:completed',   label: 'AI complete' },
    { value: 'ai:error',       label: 'AI error' },
];

const formatDateTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
};

// ─── Component ────────────────────────────────────────────────────────────────
const NotificationsPage = () => {
    const { notifications, liveProgress, unreadCount, connected, markRead, markAllRead, deleteOne, deleteAll, refresh } = useNotifications();
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterType, setFilterType] = useState('');

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    // Re-fetch from DB when search/filter changes
    useEffect(() => {
        refresh(debouncedSearch || null, filterType || null);
    }, [debouncedSearch, filterType, refresh]);

    // Live progress entries to show at the top
    const progressEntries = useMemo(() =>
        Object.values(liveProgress).sort((a, b) => b.ts - a.ts),
        [liveProgress]
    );

    const hasNotifications = notifications.length > 0 || progressEntries.length > 0;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[hsl(220,15%,10%)]">
            <Helmet><title>Notifications | Pycasa</title></Helmet>

            <div className="max-w-3xl mx-auto px-4 py-8">
                {/* Page header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <Bell className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Notifications</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${connected ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {connected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                                    {connected ? 'Live' : 'Reconnecting...'}
                                </span>
                                {unreadCount > 0 && (
                                    <span className="text-[10px] text-slate-500">{unreadCount} unread</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bulk actions */}
                    {hasNotifications && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={markAllRead}>
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark all read
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-red-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50" onClick={deleteAll}>
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete all
                            </Button>
                        </div>
                    )}
                </div>

                {/* Search + filter bar */}
                <div className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search notifications..."
                            className="pl-9 h-9 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <select
                            value={filterType}
                            onChange={e => setFilterType(e.target.value)}
                            className="h-9 pl-8 pr-8 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 appearance-none cursor-pointer"
                        >
                            {FILTER_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Live progress entries (not in DB) */}
                {progressEntries.length > 0 && (
                    <div className="mb-3 space-y-2">
                        {progressEntries.map(event => {
                            const meta = EVENT_META[event.type] || EVENT_META['ai:progress'];
                            const Icon = meta.icon;
                            const p = event.payload || {};
                            const msg = event.type === 'scan:progress'
                                ? `${p.scanned} found${p.current_file ? ` — ${p.current_file}` : ''}`
                                : `${p.analysed}/${p.total}${p.current_file ? ` — ${p.current_file}` : ''}`;
                            return (
                                <div key={event.type} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${meta.border} ${meta.bg} animate-pulse`}>
                                    <Icon className={`w-4 h-4 ${meta.color} animate-spin shrink-0`} />
                                    <div className="flex-1 min-w-0">
                                        <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                                        <span className="text-xs text-slate-500 ml-2 truncate">{msg}</span>
                                    </div>
                                    <Badge variant="outline" className={`text-[9px] ${meta.color} border-current`}>Live</Badge>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Notification list */}
                {notifications.length === 0 && progressEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <Bell className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-sm font-medium">No notifications</p>
                        <p className="text-xs mt-1 opacity-70">Events from scans and AI analysis will appear here</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {notifications.map(n => {
                            const meta = EVENT_META[n.event_type] || { icon: Bell, color: 'text-slate-500', bg: 'bg-white', border: 'border-slate-200', label: n.event_type };
                            const Icon = meta.icon;
                            return (
                                <div
                                    key={n.id}
                                    className={`group flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${n.read ? 'bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/60' : `${meta.bg} ${meta.border}`}`}
                                >
                                    <div className={`mt-0.5 p-1.5 rounded-lg ${n.read ? 'bg-slate-100 dark:bg-slate-700' : meta.bg} shrink-0`}>
                                        <Icon className={`w-4 h-4 ${n.read ? 'text-slate-400 dark:text-slate-500' : meta.color}`} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs font-semibold ${n.read ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                                                {meta.label}
                                            </span>
                                            {!n.read && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                            )}
                                        </div>
                                        <p className={`text-xs mt-0.5 ${n.read ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                                            {n.message}
                                        </p>
                                        {n.detail && (
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono truncate">{n.detail}</p>
                                        )}
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{formatDateTime(n.ts)}</p>
                                    </div>

                                    {/* Per-item actions — visible on hover */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {!n.read && (
                                            <button
                                                onClick={() => markRead(n.id)}
                                                title="Mark as read"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                                            >
                                                <CheckCheck className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteOne(n.id)}
                                            title="Delete"
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsPage;
