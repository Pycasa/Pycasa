import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import {
    FolderClosed,
    Plus,
    Trash2,
    ArrowLeft,
    Loader2,
    Search,
    Image as ImageIcon,
    ChevronDown,
    Grid,
    List,
    FolderPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

const PAGE_LIMIT = 50;

const AlbumsView = () => {
    const { albumId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    // Albums state
    const [albums, setAlbums] = useState([]);
    const [albumsLoading, setAlbumsLoading] = useState(true);
    const [albumSearch, setAlbumSearch] = useState('');
    const [newAlbumName, setNewAlbumName] = useState('');
    const [newAlbumDesc, setNewAlbumDesc] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'owned', 'shared'

    // Specific album state
    const [currentAlbum, setCurrentAlbum] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [images, setImages] = useState([]);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);

    const containerRef = useRef(null);
    const sentinelRef = useRef(null);

    // ── Fetch Albums ────────────────────────────────────────────────────────────
    const fetchAlbums = async () => {
        setAlbumsLoading(true);
        try {
            const data = await api.albums.list();
            setAlbums(data || []);
        } catch (err) {
            console.error('Failed to fetch albums:', err);
            toast({
                title: 'Error',
                description: 'Failed to load albums',
                variant: 'destructive',
            });
        } finally {
            setAlbumsLoading(false);
        }
    };

    useEffect(() => {
        if (!albumId) {
            fetchAlbums();
        }
    }, [albumId]);

    // ── Fetch Specific Album Details & Images ────────────────────────────────────
    const fetchAlbumImages = useCallback(
        async (pageNum, reset = false) => {
            if (!albumId) return;
            setImagesLoading(true);
            try {
                // First, find the album info from the list
                const albumList = await api.albums.list();
                const found = albumList.find((a) => a.id === albumId);
                if (found) {
                    setCurrentAlbum(found);
                }

                const data = await api.images.list(
                    null, // folderId
                    null, // search
                    null, // tags
                    'modified_at', // sortBy
                    'DESC', // sortOrder
                    pageNum,
                    PAGE_LIMIT,
                    null, // dateFrom
                    null, // dateTo
                    null, // extensions
                    null, // sizeMin
                    null, // sizeMax
                    null, // favorite
                    false, // trashed
                    albumId
                );

                const normalized = (data || []).map((img) => ({
                    ...img,
                    full_path: img.file_path,
                    modified: img.modified_at,
                    size: img.file_size,
                }));

                setImages((prev) => (reset ? normalized : [...prev, ...normalized]));
                setHasMore(normalized.length === PAGE_LIMIT);
            } catch (err) {
                console.error('Failed to load album images:', err);
                toast({
                    title: 'Error',
                    description: 'Failed to load album images',
                    variant: 'destructive',
                });
            } finally {
                setImagesLoading(false);
            }
        },
        [albumId, toast]
    );

    useEffect(() => {
        if (albumId) {
            setPage(1);
            fetchAlbumImages(1, true);
        } else {
            setCurrentAlbum(null);
            setImages([]);
        }
    }, [albumId, fetchAlbumImages]);

    // ── Infinite scroll for Album Detail ─────────────────────────────────────────
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !albumId) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !imagesLoading) {
                    const next = page + 1;
                    setPage(next);
                    fetchAlbumImages(next, false);
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, imagesLoading, page, fetchAlbumImages, albumId]);

    // ── Create Album ─────────────────────────────────────────────────────────────
    const handleCreateAlbum = async (e) => {
        e.preventDefault();
        if (!newAlbumName.trim()) return;
        try {
            const newAlbum = await api.albums.create(newAlbumName.trim(), newAlbumDesc.trim());
            toast({
                title: 'Success',
                description: `Album "${newAlbum.name}" created`,
            });
            setNewAlbumName('');
            setNewAlbumDesc('');
            setIsCreateOpen(false);
            fetchAlbums();
            // Notify Sidebar to reload
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
        } catch (err) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to create album',
                variant: 'destructive',
            });
        }
    };

    // ── Update Album Details (Name/Description) ──────────────────────────────────
    const handleSaveName = async () => {
        if (!editName.trim() || editName.trim() === currentAlbum?.name) {
            setIsEditingName(false);
            return;
        }
        try {
            const updated = await api.albums.update(albumId, { name: editName.trim() });
            setCurrentAlbum(updated);
            toast({
                title: 'Success',
                description: 'Album name updated',
            });
            // Notify Sidebar to reload
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
        } catch (err) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to update album name',
                variant: 'destructive',
            });
        } finally {
            setIsEditingName(false);
        }
    };

    const handleSaveDesc = async () => {
        if (editDesc.trim() === (currentAlbum?.description || '')) {
            setIsEditingDesc(false);
            return;
        }
        try {
            const updated = await api.albums.update(albumId, { description: editDesc.trim() });
            setCurrentAlbum(updated);
            toast({
                title: 'Success',
                description: 'Album description updated',
            });
        } catch (err) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to update description',
                variant: 'destructive',
            });
        } finally {
            setIsEditingDesc(false);
        }
    };

    // ── Delete Album ─────────────────────────────────────────────────────────────
    const handleDeleteAlbum = async (id, name, e) => {
        if (e) e.stopPropagation();
        if (
            !window.confirm(
                `Are you sure you want to delete the album "${name}"?\nThe photos themselves will not be deleted.`
            )
        ) {
            return;
        }

        try {
            await api.albums.delete(id);
            toast({
                title: 'Album deleted',
                description: `"${name}" has been removed.`,
            });
            if (albumId === id) {
                navigate('/albums');
            } else {
                fetchAlbums();
            }
            // Notify Sidebar to reload
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to delete album',
                variant: 'destructive',
            });
        }
    };

    // Filter albums by search query
    const filteredAlbums = albums.filter((album) =>
        album.name.toLowerCase().includes(albumSearch.toLowerCase())
    );

    // Group filtered albums by year
    const albumsByYear = filteredAlbums.reduce((acc, album) => {
        const year = new Date(album.created_at).getFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(album);
        return acc;
    }, {});

    const sortedYears = Object.keys(albumsByYear).sort((a, b) => b - a);

    // ── Render Specific Album View ───────────────────────────────────────────────
    if (albumId) {
        return (
            <div
                ref={containerRef}
                className="h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20 flex flex-col"
            >
                {/* Header */}
                <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white/85 dark:bg-[#060913]/85 backdrop-blur border-b border-slate-200/60 dark:border-white/[0.06] shrink-0">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        <button
                            onClick={() => navigate('/albums')}
                            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 transition-colors"
                            title="Back to Albums"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            {isEditingName ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={handleSaveName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveName();
                                        if (e.key === 'Escape') setIsEditingName(false);
                                    }}
                                    className="text-[16px] font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full max-w-sm"
                                    autoFocus
                                />
                            ) : (
                                <div className="flex items-center gap-2 group">
                                    <h1
                                        onClick={() => {
                                            setEditName(currentAlbum?.name || '');
                                            setIsEditingName(true);
                                        }}
                                        className="text-[16px] font-semibold text-slate-900 dark:text-white truncate cursor-pointer hover:underline"
                                    >
                                        {currentAlbum?.name || 'Album'}
                                    </h1>
                                    <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                                        Click to edit
                                    </span>
                                </div>
                            )}

                            {isEditingDesc ? (
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    onBlur={handleSaveDesc}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSaveDesc();
                                        }
                                        if (e.key === 'Escape') setIsEditingDesc(false);
                                    }}
                                    placeholder="Add a description..."
                                    className="text-[12px] text-slate-600 dark:text-white/70 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full max-w-md mt-1 resize-none"
                                    rows={2}
                                    autoFocus
                                />
                            ) : (
                                <div className="flex items-center gap-2 group mt-0.5">
                                    <p
                                        onClick={() => {
                                            setEditDesc(currentAlbum?.description || '');
                                            setIsEditingDesc(true);
                                        }}
                                        className={`text-[12px] cursor-pointer hover:underline truncate max-w-md ${
                                            currentAlbum?.description
                                                ? 'text-slate-600 dark:text-white/70'
                                                : 'text-slate-400 dark:text-white/30 italic'
                                        }`}
                                    >
                                        {currentAlbum?.description || 'Add a description...'}
                                    </p>
                                    <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                                        Click to edit
                                    </span>
                                </div>
                            )}

                            <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium mt-1 select-none">
                                {images.length} photo{images.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/15 text-xs font-medium shrink-0"
                        onClick={() => handleDeleteAlbum(albumId, currentAlbum?.name)}
                    >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Delete Album
                    </Button>
                </div>

                {/* Photo Grid */}
                <div className="flex-1 p-6">
                    {images.length > 0 ? (
                        <div className="flex flex-wrap gap-1" style={{ alignItems: 'flex-start' }}>
                            {images.map((img) => (
                                <ImageCard
                                    key={img.id || img.full_path}
                                    image={img}
                                    isSelected={selectedImage?.id === img.id}
                                    onSelect={setSelectedImage}
                                    rowHeight={190}
                                />
                            ))}
                            <div
                                className="flex-grow-[100000] shrink"
                                style={{ flexBasis: '0px', height: '0px' }}
                            />
                        </div>
                    ) : (
                        !imagesLoading && (
                            <div className="h-96 flex flex-col items-center justify-center text-slate-400">
                                <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-[15px] font-semibold text-slate-700 dark:text-white/80">
                                    This album is empty
                                </p>
                                <p className="text-[13px] text-slate-400 dark:text-white/30 max-w-xs text-center mt-1 leading-relaxed">
                                    Open any photo and click the info icon, then add it to this
                                    album using the Info sidebar.
                                </p>
                            </div>
                        )
                    )}

                    {/* Infinite scroll sentinel */}
                    <div ref={sentinelRef} className="h-1" />

                    {/* Loading spinner */}
                    {imagesLoading && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500/60" />
                        </div>
                    )}
                </div>

                {selectedImage && (
                    <ImageDetailModal
                        image={selectedImage}
                        isOpen={!!selectedImage}
                        onClose={() => setSelectedImage(null)}
                        onUpdate={() => {
                            fetchAlbumImages(1, true);
                        }}
                        onNext={() => {
                            const idx = images.findIndex((img) => img.id === selectedImage.id);
                            if (idx !== -1 && idx < images.length - 1) {
                                setSelectedImage(images[idx + 1]);
                            }
                        }}
                        onPrevious={() => {
                            const idx = images.findIndex((img) => img.id === selectedImage.id);
                            if (idx > 0) {
                                setSelectedImage(images[idx - 1]);
                            }
                        }}
                        hasNext={
                            images.findIndex((img) => img.id === selectedImage.id) <
                            images.length - 1
                        }
                        hasPrevious={images.findIndex((img) => img.id === selectedImage.id) > 0}
                    />
                )}
            </div>
        );
    }

    // ── Render Albums List View ──────────────────────────────────────────────────
    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20 flex flex-col">
            {/* Header bar */}
            <div className="sticky top-0 z-20 bg-white/85 dark:bg-[#060913]/85 backdrop-blur border-b border-slate-200/60 dark:border-white/[0.06] px-8 py-4 space-y-4 shadow-sm shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <h1 className="text-[16px] font-bold text-slate-900 dark:text-white">
                            Albums
                        </h1>

                        {/* Filter tabs */}
                        <div className="flex bg-slate-100 dark:bg-white/[0.05] p-0.5 rounded-lg text-xs">
                            {['all', 'owned', 'shared'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-3 py-1.5 rounded-md font-medium capitalize transition-all ${
                                        activeTab === tab
                                            ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                                            : 'text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/80'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search bar */}
                        <div className="relative w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Search albums..."
                                value={albumSearch}
                                onChange={(e) => setAlbumSearch(e.target.value)}
                                className="h-9 pl-8 text-xs bg-slate-100 dark:bg-white/[0.04] border-slate-200/60 dark:border-white/10 text-slate-900 dark:text-gray-200 placeholder:text-slate-400 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                            />
                        </div>

                        {/* Create Album Dialog */}
                        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-medium rounded-lg h-9 px-4 gap-1.5 transition-all text-xs active:scale-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    Create album
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#09090b] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white">
                                <form onSubmit={handleCreateAlbum}>
                                    <DialogHeader>
                                        <DialogTitle className="text-[16px] font-bold flex items-center gap-2">
                                            <FolderPlus className="w-5 h-5 text-indigo-500" />
                                            Create new album
                                        </DialogTitle>
                                        <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                                            Give your album a name and optional description to group
                                            your favorite memories.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-3.5">
                                        <div className="space-y-1">
                                            <label
                                                htmlFor="album-name"
                                                className="text-[11px] font-medium text-slate-400 dark:text-white/40"
                                            >
                                                Album Name
                                            </label>
                                            <Input
                                                id="album-name"
                                                placeholder="E.g. Summer Vacation 2026"
                                                value={newAlbumName}
                                                onChange={(e) => setNewAlbumName(e.target.value)}
                                                className="w-full text-sm bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 focus-visible:ring-indigo-500"
                                                autoFocus
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label
                                                htmlFor="album-desc"
                                                className="text-[11px] font-medium text-slate-400 dark:text-white/40"
                                            >
                                                Description (optional)
                                            </label>
                                            <textarea
                                                id="album-desc"
                                                placeholder="Describe this album..."
                                                value={newAlbumDesc}
                                                onChange={(e) => setNewAlbumDesc(e.target.value)}
                                                className="w-full text-sm bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none h-20"
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setIsCreateOpen(false)}
                                            className="text-xs text-slate-500"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-xs"
                                        >
                                            Create Album
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            {/* Main Albums Grid */}
            <div className="flex-1 p-8">
                {albumsLoading ? (
                    <div className="h-64 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500/60" />
                    </div>
                ) : sortedYears.length > 0 ? (
                    <div className="space-y-8">
                        {sortedYears.map((year) => (
                            <div key={year} className="space-y-4">
                                <h2 className="text-[14px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 select-none border-b border-slate-100 dark:border-white/[0.04] pb-2">
                                    <span>{year}</span>
                                    <span className="text-[11px] font-medium text-slate-400 dark:text-white/35">
                                        ({albumsByYear[year].length} Album
                                        {albumsByYear[year].length !== 1 ? 's' : ''})
                                    </span>
                                </h2>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                    {albumsByYear[year].map((album) => (
                                        <div
                                            key={album.id}
                                            onClick={() => navigate(`/albums/${album.id}`)}
                                            className="group cursor-pointer flex flex-col select-none"
                                        >
                                            {/* Album Card Cover */}
                                            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06] shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:scale-[1.02]">
                                                {album.cover_image_thumbnail ? (
                                                    <img
                                                        src={api.images.getThumbnail(
                                                            album.cover_image_thumbnail
                                                        )}
                                                        alt={album.name}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700">
                                                        <FolderClosed className="w-10 h-10 stroke-[1.2] opacity-80" />
                                                    </div>
                                                )}

                                                {/* Hover actions */}
                                                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-end p-2.5 z-10">
                                                    <button
                                                        onClick={(e) =>
                                                            handleDeleteAlbum(
                                                                album.id,
                                                                album.name,
                                                                e
                                                            )
                                                        }
                                                        className="p-2 rounded-full bg-white/90 dark:bg-zinc-900/90 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all hover:scale-115 shadow"
                                                        title="Delete album"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Album Details */}
                                            <div className="mt-2.5 px-0.5">
                                                <h3 className="text-[13px] font-semibold text-slate-800 dark:text-white/90 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                    {album.name}
                                                </h3>
                                                <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium mt-0.5">
                                                    {album.image_count} item
                                                    {album.image_count !== 1 ? 's' : ''}
                                                    {activeTab === 'shared' ? ' • Shared' : ''}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                        <FolderClosed className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-[15px] font-semibold text-slate-700 dark:text-white/80">
                            No albums found
                        </p>
                        <p className="text-xs text-slate-400 dark:text-white/30 mt-1">
                            Click "+ Create album" to get started.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlbumsView;
