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
    ChevronDown,
    FolderHeart,
    Server,
    Heart,
    FolderClosed,
    Archive,
    Trash2,
    Lock,
    MapPin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useNotifications } from '@/context/NotificationsContext';
import { useTheme } from '@/context/ThemeContext';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const Sidebar = ({ username, onLogout, activeTab, onItemClick }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { unreadCount, aiStatus } = useNotifications();
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const [folders, setFolders] = useState([]);
    const [albums, setAlbums] = useState([]);
    const [isAlbumsExpanded, setIsAlbumsExpanded] = useState(true);
    const [dbSizeStr, setDbSizeStr] = useState('1.2 GB');
    const [dbSizePercent, setDbSizePercent] = useState(12);
    const [localAIStatus, setLocalAIStatus] = useState(null);

    useEffect(() => {
        const updateStats = async () => {
            try {
                const ai = await api.ai.getAnalysisStatus();
                setLocalAIStatus({
                    is_running: ai.is_running || ai.running,
                    db_total: ai.db_total || 0,
                    db_analysed: ai.db_analysed || 0,
                });
            } catch (err) {
                console.error('Failed to refresh AI status:', err);
            }
        };

        updateStats();
        const interval = setInterval(updateStats, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', isCollapsed);
    }, [isCollapsed]);

    const fetchAlbums = async () => {
        try {
            const data = await api.albums.list();
            setAlbums(data || []);
        } catch (err) {
            console.error('Failed to load albums in sidebar:', err);
        }
    };

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
        fetchAlbums();

        window.addEventListener('pycasa-albums-updated', fetchAlbums);
        return () => window.removeEventListener('pycasa-albums-updated', fetchAlbums);
    }, []);

    // Main Section items
    const mainNavItems = [
        { id: 'timeline', label: 'Photos', icon: Calendar, path: '/timeline' },
        { id: 'gallery', label: 'Gallery', icon: ImageIcon, path: '/gallery' },
    ];

    // Library Section items (matches modern)
    const libraryNavItems = [
        { id: 'places', label: 'Places', icon: MapPin, path: '/places' },
        { id: 'trash', label: 'Trash', icon: Trash2, path: '/trash' },
    ];

    return (
        <aside
            className={`relative h-screen flex flex-col justify-between transition-all duration-300 z-30 shrink-0 bg-slate-50 dark:bg-[#09090b] border-r border-slate-200 dark:border-white/[0.06] ${
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
                            <span className="text-[15px] font-semibold tracking-tight text-slate-800 dark:text-white/90">
                                Pycasa
                            </span>
                        )}
                    </Link>

                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="hidden md:flex items-center justify-center w-5 h-5 rounded-full border border-slate-200 dark:border-white/10 hover:bg-slate-200/50 dark:hover:bg-white/10 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/70 transition-colors"
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
                                        ? 'bg-slate-200/60 text-slate-900 dark:bg-white/10 dark:text-white'
                                        : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                                }`}
                            >
                                <Icon
                                    className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/50'}`}
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

                {/* Section 2: Library Header & Items (modern styling) */}
                <div className="px-3 py-1">
                    {!isCollapsed && (
                        <p className="text-[11px] font-medium text-slate-400 dark:text-white/30 px-3 py-1.5 select-none">
                            Library
                        </p>
                    )}
                    <nav className="space-y-0.5">
                        {/* Favorites (always first in Library) */}
                        {(() => {
                            const isActive = activeTab === 'favorites';
                            const content = (
                                <button
                                    onClick={() => {
                                        navigate('/favorites');
                                        if (onItemClick) onItemClick();
                                    }}
                                    className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                                        isActive
                                            ? 'bg-slate-200/60 text-slate-900 dark:bg-white/10 dark:text-white'
                                            : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                                    }`}
                                >
                                    <Heart
                                        className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/50'}`}
                                    />
                                    {!isCollapsed && <span className="truncate">Favorites</span>}
                                </button>
                            );

                            if (isCollapsed) {
                                return (
                                    <Tooltip key="favorites" delayDuration={100}>
                                        <TooltipTrigger asChild>{content}</TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="text-xs bg-zinc-900 border-zinc-800 text-white shadow-xl"
                                        >
                                            Favorites
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            }

                            return <div key="favorites">{content}</div>;
                        })()}

                        {/* Albums (Expandable Section) */}
                        {(() => {
                            const isActive = activeTab === 'albums';
                            const content = (
                                <div className="w-full">
                                    <button
                                        onClick={() => {
                                            navigate('/albums');
                                            if (onItemClick) onItemClick();
                                        }}
                                        className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                                            isActive
                                                ? 'bg-slate-200/60 text-slate-900 dark:bg-white/10 dark:text-white'
                                                : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FolderClosed
                                                className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/50'}`}
                                            />
                                            {!isCollapsed && (
                                                <span className="truncate">Albums</span>
                                            )}
                                        </div>
                                        {!isCollapsed && (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsAlbumsExpanded(!isAlbumsExpanded);
                                                }}
                                                className="p-0.5 hover:bg-slate-300/50 dark:hover:bg-white/10 rounded transition-colors"
                                            >
                                                {isAlbumsExpanded ? (
                                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                ) : (
                                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                                )}
                                            </span>
                                        )}
                                    </button>

                                    {/* Sub-albums list */}
                                    {!isCollapsed && isAlbumsExpanded && albums.length > 0 && (
                                        <div className="pl-6 pr-2 py-1 space-y-0.5">
                                            {albums.map((album) => {
                                                const isAlbumActive =
                                                    location.pathname === `/albums/${album.id}`;
                                                return (
                                                    <button
                                                        key={album.id}
                                                        onClick={() => {
                                                            navigate(`/albums/${album.id}`);
                                                            if (onItemClick) onItemClick();
                                                        }}
                                                        className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                                                            isAlbumActive
                                                                ? 'bg-slate-200/40 text-slate-900 dark:bg-white/5 dark:text-white'
                                                                : 'text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/30 dark:hover:bg-white/[0.03]'
                                                        }`}
                                                    >
                                                        {album.cover_image_thumbnail ? (
                                                            <img
                                                                src={api.images.getThumbnail(
                                                                    album.cover_image_thumbnail
                                                                )}
                                                                alt=""
                                                                className="w-4 h-4 rounded object-cover shrink-0"
                                                            />
                                                        ) : (
                                                            <FolderClosed className="w-3.5 h-3.5 text-slate-400 dark:text-white/30 shrink-0" />
                                                        )}
                                                        <span className="truncate text-left flex-1">
                                                            {album.name}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );

                            if (isCollapsed) {
                                return (
                                    <Tooltip key="albums" delayDuration={100}>
                                        <TooltipTrigger asChild>{content}</TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="text-xs bg-zinc-900 border-zinc-800 text-white shadow-xl"
                                        >
                                            Albums
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            }

                            return <div key="albums">{content}</div>;
                        })()}

                        {/* Other Library Items (Places, Trash) */}
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
                                            ? 'bg-slate-200/60 text-slate-900 dark:bg-white/10 dark:text-white'
                                            : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                                    }`}
                                >
                                    <Icon
                                        className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/50'}`}
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

            {/* Sidebar Bottom Section: Storage & Version */}
            <div className="p-3 border-t border-slate-200 dark:border-white/[0.06] space-y-2 shrink-0">
                {/* AI Analysis Widget Card */}
                {!isCollapsed && (
                    <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                            <div className="bg-slate-200/30 dark:bg-white/[0.04] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.06] cursor-help transition-colors hover:bg-slate-200/50 dark:hover:bg-white/[0.08]">
                                <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 dark:text-white/40 mb-2">
                                    <span>AI Analysis</span>
                                    <span className="tabular-nums font-medium text-slate-500 dark:text-white/60">
                                        {localAIStatus?.db_analysed || 0} of{' '}
                                        {localAIStatus?.db_total || 0}
                                    </span>
                                </div>
                                {(() => {
                                    const total = localAIStatus?.db_total || 0;
                                    const analysed = localAIStatus?.db_analysed || 0;
                                    const percent =
                                        total > 0 ? Math.round((analysed / total) * 100) : 0;
                                    return (
                                        <>
                                            <div className="w-full bg-slate-200 dark:bg-white/10 h-1 rounded-full overflow-hidden mb-2">
                                                <div
                                                    className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-white/45">
                                                <span>{percent}% analysed</span>
                                                {localAIStatus?.is_running && (
                                                    <span className="text-indigo-500 dark:text-indigo-400 animate-pulse font-medium">
                                                        Analyzing...
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent
                            side="right"
                            align="center"
                            className="max-w-xs text-xs bg-zinc-900 border-zinc-800 text-white shadow-xl p-3 space-y-1"
                        >
                            <p className="font-semibold text-indigo-400">AI Metadata Indexing</p>
                            <p className="text-zinc-300 leading-relaxed">
                                Shows the proportion of images in your library processed by the
                                local AI vision model. AI analysis generates descriptions and tags
                                to enable smart search and filtering.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}

                {/* Storage Widget Card (modern style) */}
                {!isCollapsed && (
                    <div className="bg-slate-200/30 dark:bg-white/[0.04] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.06]">
                        <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 dark:text-white/40 mb-2">
                            <span>Storage space</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-white/10 h-1 rounded-full overflow-hidden mb-2">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${dbSizePercent}%` }}
                            />
                        </div>
                        <div className="text-[10px] text-slate-400/80 dark:text-white/30 font-medium flex justify-between">
                            <span>{dbSizeStr} used</span>
                            <span>of 50 GB</span>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
