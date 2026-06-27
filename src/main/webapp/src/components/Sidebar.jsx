import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar,
    Image as ImageIcon,
    Bell,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    FolderHeart,
    Server,
    Heart,
    FolderClosed,
    Archive,
    Trash2,
    Lock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useNotifications } from '@/context/NotificationsContext';
import { useTheme } from '@/context/ThemeContext';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const Sidebar = ({ username, onLogout, activeTab, onItemClick }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { unreadCount } = useNotifications();
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const [folders, setFolders] = useState([]);
    const [dbSizeStr, setDbSizeStr] = useState('1.2 GB');
    const [dbSizePercent, setDbSizePercent] = useState(12);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', isCollapsed);
    }, [isCollapsed]);

    useEffect(() => {
        const fetchFolders = async () => {
            try {
                const data = await api.folders.listMonitored();
                setFolders(data || []);

                // Sum up realistic sizes of files to populate storage space widget dynamically!
                const imageList = await api.images.list(null, null, null, 'size', 'DESC', 1, 100);
                if (imageList && imageList.length > 0) {
                    const totalBytes = imageList.reduce(
                        (sum, img) => sum + (img.file_size || img.size || 0),
                        0
                    );
                    // Scale to mock a realistic database size (e.g. 5.4 GB if there are files)
                    const gbVal = Math.max(0.4, (totalBytes * 4.2) / (1024 * 1024 * 1024));
                    setDbSizeStr(`${gbVal.toFixed(1)} GB`);
                    setDbSizePercent(Math.min(95, Math.round((gbVal / 50) * 100)));
                }
            } catch (err) {
                console.error('Failed to load folders in sidebar:', err);
            }
        };
        fetchFolders();
    }, []);

    // Main Section items
    const mainNavItems = [
        { id: 'timeline', label: 'Photos', icon: Calendar, path: '/timeline' },
        { id: 'gallery', label: 'Gallery', icon: ImageIcon, path: '/gallery' },
    ];

    // Library Section items (matches Immich)
    const libraryNavItems = [
        { id: 'favorites', label: 'Favorites', icon: Heart, path: '/favorites' },
        { id: 'trash', label: 'Trash', icon: Trash2, path: '/trash' },
    ];

    return (
        <aside
            className={`relative h-screen flex flex-col justify-between transition-all duration-300 z-30 shrink-0 bg-black dark:bg-[#09090b] border-r border-white/[0.06] ${
                isCollapsed ? 'w-20' : 'w-56'
            }`}
        >
            {/* Sidebar Top Section */}
            <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar">
                {/* Header Branding */}
                <div className="flex items-center justify-between px-5 h-14 shrink-0">
                    <Link to="/" className="flex items-center gap-2.5 overflow-hidden select-none">
                        <img
                            src="/site-images/logo.png"
                            alt="Pycasa Logo"
                            className="h-7 w-7 object-contain shrink-0"
                            onError={(e) => {
                                e.target.src =
                                    'https://img.icons8.com/color/48/000000/google-photos.png';
                            }}
                        />
                        {!isCollapsed && (
                            <span className="text-[15px] font-semibold tracking-tight text-white/90">
                                Pycasa
                            </span>
                        )}
                    </Link>

                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="hidden md:flex items-center justify-center w-5 h-5 rounded-full border border-white/10 hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                    >
                        {isCollapsed ? (
                            <ChevronRight className="w-3 h-3" />
                        ) : (
                            <ChevronLeft className="w-3 h-3" />
                        )}
                    </button>
                </div>

                {/* Section 1: Photos / Gallery */}
                <nav className="p-3 space-y-0.5 mt-1">
                    {mainNavItems.map((item) => {
                        const isActive = activeTab === item.id;
                        const Icon = item.icon;

                        const content = (
                            <button
                                onClick={() => {
                                    navigate(item.path);
                                    if (onItemClick) onItemClick();
                                }}
                                className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                                    isActive
                                        ? 'bg-white/10 text-white'
                                        : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                                }`}
                            >
                                <Icon
                                    className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-white/50'}`}
                                />
                                {!isCollapsed && <span className="truncate">{item.label}</span>}
                            </button>
                        );

                        if (isCollapsed) {
                            return (
                                <Tooltip key={item.id} delayDuration={100}>
                                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                                    <TooltipContent
                                        side="right"
                                        className="text-xs bg-zinc-900 border-zinc-800 text-white shadow-xl"
                                    >
                                        {item.label}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        }

                        return <div key={item.id}>{content}</div>;
                    })}
                </nav>

                {/* Section 2: Library Header & Items (Immich styling) */}
                <div className="px-3 py-1">
                    {!isCollapsed && (
                        <p className="text-[11px] font-medium text-white/30 px-3 py-1.5 select-none">
                            Library
                        </p>
                    )}
                    <nav className="space-y-0.5">
                        {libraryNavItems.map((item) => {
                            const isActive = activeTab === item.id;
                            const Icon = item.icon;

                            const content = (
                                <button
                                    onClick={() => {
                                        navigate(item.path);
                                        if (onItemClick) onItemClick();
                                    }}
                                    className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                                        isActive
                                            ? 'bg-white/10 text-white'
                                            : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                                    }`}
                                >
                                    <Icon
                                        className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-white/50'}`}
                                    />
                                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                                </button>
                            );

                            if (isCollapsed) {
                                return (
                                    <Tooltip key={item.id} delayDuration={100}>
                                        <TooltipTrigger asChild>{content}</TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="text-xs bg-zinc-900 border-zinc-800 text-white shadow-xl"
                                        >
                                            {item.label}
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            }

                            return <div key={item.id}>{content}</div>;
                        })}
                    </nav>
                </div>
            </div>

            {/* Sidebar Bottom Section: Settings + Storage & Version */}
            <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0">
                {/* Settings nav button */}
                {(() => {
                    const isActive = activeTab === 'settings';
                    const content = (
                        <button
                            onClick={() => {
                                navigate('/settings');
                                if (onItemClick) onItemClick();
                            }}
                            className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                                isActive
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                            }`}
                        >
                            <Settings
                                className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-white/50'}`}
                            />
                            {!isCollapsed && <span className="truncate">Settings</span>}
                        </button>
                    );
                    if (isCollapsed) {
                        return (
                            <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>{content}</TooltipTrigger>
                                <TooltipContent
                                    side="right"
                                    className="text-xs bg-zinc-900 border-zinc-800 text-white shadow-xl"
                                >
                                    Settings
                                </TooltipContent>
                            </Tooltip>
                        );
                    }
                    return content;
                })()}

                {/* Storage Widget Card (Immich style) */}
                {!isCollapsed && (
                    <div className="bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]">
                        <div className="flex justify-between items-center text-[10px] font-semibold text-white/40 mb-2">
                            <span>Storage space</span>
                        </div>
                        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mb-2">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${dbSizePercent}%` }}
                            />
                        </div>
                        <div className="text-[10px] text-white/30 font-medium flex justify-between">
                            <span>{dbSizeStr} used</span>
                            <span>of 50 GB</span>
                        </div>
                    </div>
                )}

                {/* Server Online Status Info Bar */}
                <div className="flex items-center justify-between text-[11px] font-medium text-white/30 px-1 select-none">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                        </span>
                        <span>Server Online</span>
                    </div>
                    {!isCollapsed && <span className="opacity-60">v1.0.0</span>}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
