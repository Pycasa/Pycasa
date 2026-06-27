import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
    Search,
    Loader2,
    Menu,
    X,
    Settings,
    Sun,
    Moon,
    Bell,
    LogOut,
    Upload,
    SlidersHorizontal,
    CloudLightning,
    Database,
} from 'lucide-react';
import { useAIStatus } from '@/context/AIStatusContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useUpload } from '@/context/UploadContext';
import { useTheme } from '@/context/ThemeContext';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

const ProfileMenu = ({ username, onLogout }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const navigate = useNavigate();
    const initial = (username || 'A').charAt(0).toUpperCase();

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 dark:ring-offset-slate-900"
                aria-label="Profile menu"
                aria-expanded={open}
            >
                {initial}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#09090b] rounded-xl shadow-lg border border-slate-200/60 dark:border-white/10 overflow-hidden z-50"
                    >
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] text-center">
                            <p className="text-xs text-slate-400 dark:text-white/30 font-medium uppercase tracking-wider">
                                Signed in as
                            </p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                                {username || 'Admin'}
                            </p>
                        </div>
                        <a
                            href="/db"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpen(false)}
                            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors border-b border-slate-100 dark:border-white/[0.06]"
                        >
                            <Database className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            DB
                        </a>
                        <button
                            onClick={() => {
                                setOpen(false);
                                navigate('/settings');
                            }}
                            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                        >
                            <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            Settings
                        </button>
                        <button
                            onClick={() => {
                                setOpen(false);
                                onLogout();
                            }}
                            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-white/[0.06]"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Header = ({ onMenuClick, title, username, onLogout }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const { scanStatus, unreadCount } = useNotifications();
    const { aiStatus } = useAIStatus();
    const { toast } = useToast();
    const { startUpload, updateProgress, finishUpload, isCancelled } = useUpload();
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    // Get search param from URL
    const searchParams = new URLSearchParams(location.search);
    const initialSearch = searchParams.get('q') || '';

    const [searchValue, setSearchValue] = useState(initialSearch);

    useEffect(() => {
        setSearchValue(initialSearch);
    }, [initialSearch]);

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearchValue(value);

        if (!location.pathname.startsWith('/gallery')) {
            navigate(`/gallery?q=${encodeURIComponent(value)}`);
        } else {
            const params = new URLSearchParams(location.search);
            if (value) {
                params.set('q', value);
            } else {
                params.delete('q');
            }
            navigate(`/gallery?${params.toString()}`, { replace: true });
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleUploadChange = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);
        startUpload(files.length);

        let succeeded = 0;
        let failed = 0;

        for (let i = 0; i < files.length; i++) {
            if (isCancelled()) break;

            const file = files[i];
            updateProgress(i, file.name);

            try {
                // Upload one file at a time so we can track progress
                const form = new FormData();
                form.append('files', file);
                await fetch('/api/images/upload', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
                    },
                    body: form,
                });
                succeeded++;
            } catch {
                failed++;
            }

            updateProgress(i + 1, file.name);
        }

        finishUpload(failed);
        setIsUploading(false);

        if (fileInputRef.current) fileInputRef.current.value = '';

        if (succeeded > 0) {
            window.dispatchEvent(new CustomEvent('pycasa-image-uploaded'));
        }
    };

    const isScanning = scanStatus?.is_scanning || false;
    const filesFound = scanStatus?.files_found || 0;

    return (
        <header className="h-14 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#09090b] flex items-center justify-between px-5 z-30 shrink-0 select-none">
            {/* Left side: Hamburger (mobile) + Active Tab name */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="md:hidden flex items-center justify-center p-2 rounded-lg text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    aria-label="Toggle sidebar drawer"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </div>

            {/* Middle side: Central Search Bar (modern style) */}
            <div className="flex-1 mx-2 sm:mx-4">
                <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-600 dark:group-focus-within:text-slate-300 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search your photos"
                        value={searchValue}
                        onChange={handleSearchChange}
                        className="w-full pl-10 pr-24 py-2 text-sm bg-slate-100 dark:bg-white/[0.07] border border-slate-200 dark:border-white/10 rounded-full focus:outline-none focus:bg-white focus:dark:bg-white/[0.10] focus:border-indigo-400 dark:focus:border-white/20 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-white/10 transition-all text-slate-800 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/30 font-medium"
                    />

                    {/* Inner badge & filter icon (modern layout) */}
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {searchValue ? (
                            <button
                                onClick={() => handleSearchChange({ target: { value: '' } })}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-full"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        ) : (
                            <>
                                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 hidden sm:inline" />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Right side controls (modern style) */}
            <div className="flex items-center gap-4 shrink-0">
                {/* Scanning Pill */}
                {isScanning && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-primary border border-indigo-100 dark:border-indigo-900 animate-pulse text-[10px] font-bold uppercase tracking-wider">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="hidden md:inline">
                            Scanning {filesFound > 0 ? `(${filesFound})` : ''}
                        </span>
                    </div>
                )}

                {/* Upload/Scan Trigger Button */}
                <button
                    onClick={handleUploadClick}
                    disabled={isScanning || isUploading}
                    className="flex items-center gap-2 py-1.5 px-3.5 border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.07] text-slate-700 dark:text-white/80 text-xs font-semibold rounded-full hover:bg-slate-50 dark:hover:bg-white/[0.12] active:scale-95 transition-all shrink-0 disabled:opacity-50"
                >
                    {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    ) : (
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                </button>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUploadChange}
                    multiple
                    accept="image/*"
                    style={{ display: 'none' }}
                />

                {/* Theme Toggle Button */}
                <button
                    onClick={toggleTheme}
                    className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all shrink-0"
                    title="Toggle theme"
                >
                    {theme === 'dark' ? (
                        <Sun className="w-[18px] h-[18px]" />
                    ) : (
                        <Moon className="w-[18px] h-[18px]" />
                    )}
                </button>

                {/* Notifications Bell */}
                <button
                    onClick={() => navigate('/notifications')}
                    className={`relative w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors ${
                        location.pathname.startsWith('/notifications')
                            ? 'text-primary bg-indigo-50/50 dark:bg-indigo-950/30'
                            : 'text-slate-500 dark:text-slate-400'
                    }`}
                    title="Notifications"
                >
                    <Bell className="w-[18px] h-[18px]" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 shadow" />
                    )}
                </button>

                {/* User initials menu dropdown */}
                <ProfileMenu username={username} onLogout={onLogout} />
            </div>
        </header>
    );
};

export default Header;
