import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    X,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Sparkles,
    ScanText,
    Download,
    Heart,
    Share2,
    Info,
    Trash2,
    Save,
    Plus,
    Calendar,
    ClipboardCopy,
    Image as ImageIcon,
    Folder as FolderIcon,
    FolderClosed,
    Loader2,
    ArrowLeft,
    Camera,
    Aperture,
    MapPin,
    AlertCircle,
} from 'lucide-react';
import { Map, Marker } from 'pigeon-maps';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { formatFileSize } from '@/lib/utils';
import { useAIStatus } from '@/context/AIStatusContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/* ─── Toolbar icon button — matches modern's ActionButton style ────── */
const ToolBtn = ({ icon: Icon, label, onClick, active, danger, disabled, className = '' }) => (
    <button
        title={label}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`
            flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 disabled:opacity-30
            ${
                danger
                    ? 'text-red-400 hover:bg-red-500/20 hover:text-red-300'
                    : active
                      ? 'text-white bg-white/20'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
            } ${className}`}
    >
        <Icon className="w-[19px] h-[19px]" strokeWidth={1.8} />
    </button>
);

/* ─── Detail row — icon (24px) + text block, exact modern DetailPanel rows ── */
const DetailRow = ({ icon: Icon, primary, secondary, action, onClick }) => (
    <div
        className={`flex gap-4 py-4 ${onClick ? 'cursor-pointer hover:text-modern-primary w-full place-items-start justify-between text-start' : ''}`}
        onClick={onClick}
    >
        <div className="shrink-0">
            <Icon className="w-6 h-6 text-gray-400 dark:text-gray-300" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="break-all whitespace-pre-wrap text-sm text-black dark:text-gray-200 leading-snug">
                {primary}
            </p>
            {secondary && (
                <div className="flex flex-wrap gap-2 text-sm opacity-50 mt-0.5">
                    {secondary.split('·').map((s, i) => (
                        <p key={i}>{s.trim()}</p>
                    ))}
                </div>
            )}
        </div>
        {action && <div className="shrink-0 p-1">{action}</div>}
    </div>
);

/* ─── Section header row — matches modern's "flex h-10 items-center" label ── */
const SectionHeader = ({ children, action }) => (
    <div className="flex h-10 w-full items-center justify-between text-sm">
        <p className="text-sm text-gray-500 dark:text-gray-300">{children}</p>
        {action}
    </div>
);

/* ════════════════════════════════════════════════════════════════════
   Main Component
════════════════════════════════════════════════════════════════════ */
const ImageDetailModal = ({
    image,
    isOpen,
    onClose,
    onUpdate,
    onNext,
    onPrevious,
    hasNext,
    hasPrevious,
}) => {
    const { aiStatus } = useAIStatus();
    const [description, setDescription] = useState('');
    const [newTag, setNewTag] = useState('');
    const [tags, setTags] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [isRunningOCR, setIsRunningOCR] = useState(false);
    const [embeddings, setEmbeddings] = useState(null);
    const [details, setDetails] = useState(null);
    const [showInfo, setShowInfo] = useState(false);
    const [isFavourite, setIsFavourite] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [albums, setAlbums] = useState([]);
    const [allAlbums, setAllAlbums] = useState([]);
    const [newAlbumName, setNewAlbumName] = useState('');
    const [isAddingAlbum, setIsAddingAlbum] = useState(false);

    // Pan & zoom
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const imageContainerRef = useRef(null);
    const imgRef = useRef(null);
    const { toast } = useToast();

    const isBeingAnalyzed = aiStatus?.is_running && aiStatus.current_file === image?.full_path;
    const wasBeingAnalyzed = useRef(isBeingAnalyzed);

    // Refresh after AI finishes
    useEffect(() => {
        if (wasBeingAnalyzed.current && !isBeingAnalyzed && isOpen && image?.full_path) {
            api.images
                .getMetadata(image.full_path)
                .then((d) => {
                    setDescription(d.description || '');
                    setTags(d.tags || []);
                    setEmbeddings(d.embeddings || null);
                })
                .catch(() => {});
        }
        wasBeingAnalyzed.current = isBeingAnalyzed;
    }, [isBeingAnalyzed, image?.full_path, isOpen]);

    // Sync when image changes
    useEffect(() => {
        if (!image) return;
        setDescription(image.description || '');
        setTags(image.tags || []);
        setAlbums(image.albums || []);
        setEmbeddings(image.embeddings || null);
        setIsFavourite(image.favorite || false);
        resetZoom();
        setImgLoaded(false);
        setDetails(null);
        if (isOpen) {
            api.images
                .getDetails(image.full_path)
                .then((data) => {
                    setDetails(data);
                    if (data?.albums) {
                        setAlbums(data.albums);
                    }
                })
                .catch(() => {});
        }
    }, [image?.id, image?.full_path, isOpen]);

    const fetchAllAlbums = async () => {
        try {
            const data = await api.albums.list();
            setAllAlbums(data || []);
        } catch (err) {
            console.error('Failed to fetch all albums:', err);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchAllAlbums();
        }
    }, [isOpen]);

    const handleAddToAlbum = async (albumId) => {
        if (!image?.id) return;
        try {
            await api.albums.addImages(albumId, [image.id]);
            toast({ title: 'Added to album' });
            const albumInfo = allAlbums.find((a) => a.id === albumId);
            if (albumInfo && !albums.some((a) => a.id === albumId)) {
                setAlbums((prev) => [...prev, { id: albumInfo.id, name: albumInfo.name }]);
            }
            if (onUpdate) onUpdate();
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
        } catch (err) {
            toast({ title: 'Failed to add to album', variant: 'destructive' });
        }
    };

    const handleRemoveFromAlbum = async (albumId) => {
        if (!image?.id) return;
        try {
            await api.albums.removeImages(albumId, [image.id]);
            toast({ title: 'Removed from album' });
            setAlbums((prev) => prev.filter((a) => a.id !== albumId));
            if (onUpdate) onUpdate();
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
        } catch (err) {
            toast({ title: 'Failed to remove from album', variant: 'destructive' });
        }
    };

    const handleCreateAndAddToAlbum = async (e) => {
        e.preventDefault();
        const name = newAlbumName.trim();
        if (!name || !image?.id) return;
        setIsAddingAlbum(true);
        try {
            const newAlbum = await api.albums.create(name);
            await api.albums.addImages(newAlbum.id, [image.id]);
            toast({ title: `Created and added to "${name}"` });
            setNewAlbumName('');
            setAlbums((prev) => [...prev, { id: newAlbum.id, name: newAlbum.name }]);
            fetchAllAlbums();
            if (onUpdate) onUpdate();
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
        } catch (err) {
            toast({ title: err.message || 'Failed to create album', variant: 'destructive' });
        } finally {
            setIsAddingAlbum(false);
        }
    };

    // Handle browser cached images where onLoad might not fire
    useEffect(() => {
        if (isOpen && imgRef.current && imgRef.current.complete) {
            setImgLoaded(true);
        }
    }, [image?.full_path, isOpen]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowLeft' && hasPrevious && !typing) {
                onPrevious();
            } else if (e.key === 'ArrowRight' && hasNext && !typing) {
                onNext();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
                handleDelete();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, hasNext, hasPrevious, onNext, onPrevious]);

    // ── Handlers ──────────────────────────────────────────────────────

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.images.updateMetadata({
                id: image.id,
                folder_id: image.folder_id,
                path: image.full_path,
                description,
                tags,
                embeddings,
                favorite: isFavourite,
            });
            toast({ title: 'Metadata updated' });
            onUpdate();
        } catch (err) {
            toast({ title: 'Update failed', variant: 'destructive', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleOCR = async () => {
        setIsRunningOCR(true);
        try {
            const result = await api.ai.ocr(image.full_path);
            if (result.text) {
                setDescription((prev) => (prev ? prev + '\n\n' + result.text : result.text));
                toast({
                    title: 'OCR complete',
                    description: 'Extracted text added to description.',
                });
            } else {
                toast({ title: 'OCR complete', description: 'No text found.' });
            }
        } catch (err) {
            toast({ title: 'OCR failed', variant: 'destructive', description: err.message });
        } finally {
            setIsRunningOCR(false);
        }
    };

    const handleAnalyse = async () => {
        setIsAnalysing(true);
        try {
            const result = await api.ai.analyse(image.full_path);
            if (result.error) {
                toast({
                    title: 'Analysis failed',
                    variant: 'destructive',
                    description: result.error,
                });
                return;
            }

            const updatedTags = result.tags || tags;
            const updatedDesc = result.description || description;
            const updatedEmbeddings = result.embeddings || embeddings;

            // Perform autosave of the returned analysis metadata + existing state (like favorite)
            await api.images.updateMetadata({
                id: image.id,
                folder_id: image.folder_id,
                path: image.full_path,
                description: updatedDesc,
                tags: updatedTags,
                embeddings: updatedEmbeddings,
                favorite: isFavourite,
            });

            setTags(updatedTags);
            setDescription(updatedDesc);
            setEmbeddings(updatedEmbeddings);

            toast({ title: 'Analysis complete & autosaved' });
            if (onUpdate) onUpdate();
        } catch (err) {
            toast({ title: 'Analysis failed', variant: 'destructive', description: err.message });
            if (onUpdate) onUpdate();
        } finally {
            setIsAnalysing(false);
        }
    };

    const handleAddTag = (e) => {
        e.preventDefault();
        const t = newTag.trim();
        if (t && !tags.includes(t)) {
            setTags((prev) => [...prev, t]);
            setNewTag('');
        }
    };

    const handleDelete = async () => {
        const confirmMsg = image.trashed
            ? 'Are you sure you want to permanently delete this image? This action cannot be undone.'
            : 'Move this image to Pycasa Trash?';
        if (!window.confirm(confirmMsg)) return;
        try {
            await api.images.delete(image.folder_id, image.full_path || image.path);
            toast({ title: image.trashed ? 'Image permanently deleted' : 'Image moved to trash' });
            onUpdate();
            onClose();
        } catch {
            toast({ title: 'Delete failed', variant: 'destructive' });
        }
    };

    const handleRestore = async () => {
        try {
            await api.images.restore(image.id);
            toast({ title: 'Image restored' });
            onUpdate();
            onClose();
        } catch {
            toast({ title: 'Restore failed', variant: 'destructive' });
        }
    };

    const handleCopyPath = async () => {
        try {
            await navigator.clipboard.writeText(image.full_path);
            toast({ title: 'Path copied' });
        } catch {
            toast({ title: 'Failed to copy', variant: 'destructive' });
        }
    };

    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = api.images.getRawUrl(image.full_path);
        a.download = image.name || 'image';
        a.click();
    };

    const toggleFavourite = async () => {
        if (!image?.id) return;
        const next = !isFavourite;
        setIsFavourite(next);
        try {
            const updated = await api.images.toggleFavorite(image.id);
            if (updated) {
                setIsFavourite(updated.favorite || false);
                if (onUpdate) onUpdate();
            }
        } catch (err) {
            setIsFavourite(!next);
            toast({
                title: 'Failed to update favorite',
                variant: 'destructive',
                description: err?.message || 'Error occurred',
            });
        }
    };

    // ── Zoom & pan ─────────────────────────────────────────────────────

    const resetZoom = useCallback(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, []);
    const handleZoomIn = useCallback(() => setScale((s) => Math.min(s + 0.5, 8)), []);
    const handleZoomOut = useCallback(
        () =>
            setScale((s) => {
                const n = Math.max(s - 0.5, 1);
                if (n === 1) setPosition({ x: 0, y: 0 });
                return n;
            }),
        []
    );

    const onMouseDown = useCallback(
        (e) => {
            if (scale > 1) {
                setIsDragging(true);
                setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
            }
        },
        [scale, position]
    );
    const onMouseMove = useCallback(
        (e) => {
            if (isDragging && scale > 1) {
                e.preventDefault();
                setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            }
        },
        [isDragging, scale, dragStart]
    );
    const onMouseUp = useCallback(() => setIsDragging(false), []);

    // Set up non-passive wheel listener on container to allow preventDefault for zooming
    useEffect(() => {
        const container = imageContainerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                handleZoomIn();
            } else {
                handleZoomOut();
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [isOpen, image, handleZoomIn, handleZoomOut]);

    if (!isOpen || !image) return null;

    // ── Derived display values ─────────────────────────────────────────

    // Helpers to parse and format dates
    const parseExifDate = (dateStr) => {
        if (!dateStr) return null;
        try {
            const standardStr = dateStr.replace(/:/g, (match, offset) => {
                if (offset < 10) return '-';
                return match;
            });
            const d = new Date(standardStr);
            if (!isNaN(d.getTime())) return d;
        } catch (e) {
            // ignore
        }
        return null;
    };

    const formatTimeWithTz = (date) => {
        if (!date) return '';
        const time = date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        const offsetMinutes = -date.getTimezoneOffset();
        const sign = offsetMinutes >= 0 ? '+' : '-';
        const absMinutes = Math.abs(offsetMinutes);
        const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
        const minutes = String(absMinutes % 60).padStart(2, '0');
        const offsetStr = `GMT${sign}${hours}:${minutes}`;
        const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
        return `${weekday}, ${time} ${offsetStr}`;
    };

    let displayDate = null;
    if (details?.date_taken) {
        displayDate = parseExifDate(details.date_taken);
    }
    if (!displayDate && image.modified) {
        displayDate = new Date(image.modified);
    }

    const dateStr = displayDate
        ? displayDate.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          })
        : '';
    const timeStr = displayDate ? formatTimeWithTz(displayDate) : '';

    const widthVal = details?.width || 0;
    const heightVal = details?.height || 0;
    const dimStr = widthVal > 0 ? `${widthVal} × ${heightVal}` : '';
    const mpStr = widthVal > 0 ? `${Math.round((widthVal * heightVal) / 1_000_000)} MP` : '';
    const sizeStr = image.size ? formatFileSize(image.size) : '';
    const folderPath = image.full_path?.replace(/\/[^/]+$/, '') || '';
    const fileName = image.name || image.full_path?.split('/').pop() || '';

    return (
        <div
            className="fixed inset-0 z-50 bg-black flex flex-col"
            style={{ fontFamily: 'inherit' }}
        >
            {/* ── Top navbar — gradient fade like modern ─────────────────── */}
            <div className="shrink-0 flex items-center justify-between h-16 px-3 bg-gradient-to-b from-black/50 to-transparent relative z-10">
                {/* Back arrow */}
                <ToolBtn icon={ArrowLeft} label="Back" onClick={onClose} />

                {/* Action icons — right side, matching modern layout */}
                <div className="flex items-center gap-0.5">
                    <ToolBtn icon={Share2} label="Share" onClick={() => {}} />
                    <ToolBtn icon={ZoomIn} label="Zoom in" onClick={handleZoomIn} />
                    <ToolBtn icon={ClipboardCopy} label="Copy path" onClick={handleCopyPath} />
                    <ToolBtn icon={Download} label="Download" onClick={handleDownload} />
                    <ToolBtn
                        icon={Info}
                        label="Info"
                        onClick={() => setShowInfo((v) => !v)}
                        active={showInfo}
                    />
                    {/* Heart button with filled style when active */}
                    <button
                        title="Favourite"
                        onClick={toggleFavourite}
                        aria-label="Favourite"
                        className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 text-white/70 hover:text-white hover:bg-white/10"
                    >
                        <Heart
                            className="w-[19px] h-[19px]"
                            strokeWidth={1.8}
                            style={isFavourite ? { fill: '#f87171', color: '#f87171' } : {}}
                        />
                    </button>
                    {/* Add to Album popover button */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                title="Add to album"
                                className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 text-white/70 hover:text-white hover:bg-white/10"
                            >
                                <FolderClosed className="w-[19px] h-[19px]" strokeWidth={1.8} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-60 p-3 bg-zinc-950 border-zinc-800 text-white shadow-xl rounded-xl space-y-3 z-50">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-zinc-400">Add to Album</p>
                                <div className="max-h-32 overflow-y-auto space-y-1 no-scrollbar">
                                    {allAlbums.length > 0 ? (
                                        allAlbums.map((album) => {
                                            const inAlbum = albums.some((a) => a.id === album.id);
                                            return (
                                                <div
                                                    key={album.id}
                                                    className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-white/5 text-zinc-200 transition-colors"
                                                >
                                                    <span className="truncate flex-1 pr-2">
                                                        {album.name}
                                                    </span>
                                                    {inAlbum ? (
                                                        <button
                                                            onClick={() =>
                                                                handleRemoveFromAlbum(album.id)
                                                            }
                                                            className="text-red-400 hover:text-red-500 p-1 rounded transition-colors shrink-0 hover:bg-red-500/10"
                                                            title="Remove from album"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() =>
                                                                handleAddToAlbum(album.id)
                                                            }
                                                            className="text-indigo-400 hover:text-indigo-300 p-1 rounded transition-colors shrink-0 hover:bg-indigo-500/10"
                                                            title="Add to album"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-[10px] text-zinc-500 py-2 text-center">
                                            No albums yet
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="border-t border-white/10 pt-2.5">
                                <form onSubmit={handleCreateAndAddToAlbum} className="space-y-1.5">
                                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                                        New Album
                                    </p>
                                    <div className="flex gap-1">
                                        <input
                                            value={newAlbumName}
                                            onChange={(e) => setNewAlbumName(e.target.value)}
                                            placeholder="Album name..."
                                            className="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                                            disabled={isAddingAlbum}
                                        />
                                        <button
                                            type="submit"
                                            disabled={isAddingAlbum || !newAlbumName.trim()}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white p-1 rounded disabled:opacity-50"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </PopoverContent>
                    </Popover>
                    {/* AI analysis status — subtle non-interactive icon beside heart */}
                    <span
                        title={
                            isBeingAnalyzed
                                ? 'AI analysis in progress…'
                                : image?.ai_failed
                                  ? `AI analysis failed: ${image?.ai_error || 'Unknown error'}`
                                  : image?.ai_analysed
                                    ? 'AI analysis complete'
                                    : 'Not yet AI analysed'
                        }
                        className="flex items-center justify-center w-8 h-8 rounded-full select-none cursor-default"
                    >
                        {isBeingAnalyzed ? (
                            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                        ) : image?.ai_analysed ? (
                            <img
                                src="/site-images/ai-icon.png"
                                alt="AI"
                                className="w-[23px] h-[23px] object-contain"
                            />
                        ) : (
                            <img
                                src="/site-images/ai-icon.png"
                                alt="AI"
                                className="w-[23px] h-[23px] object-contain opacity-30 grayscale"
                            />
                        )}
                    </span>
                    {image?.trashed && (
                        <ToolBtn icon={RotateCcw} label="Restore" onClick={handleRestore} />
                    )}
                    <ToolBtn
                        icon={Trash2}
                        label={image?.trashed ? 'Delete permanently' : 'Delete'}
                        onClick={handleDelete}
                        danger
                    />
                </div>
            </div>

            {/* ── Main area: image + info panel ─────────────────────────── */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* ── Image viewport ─────────────────────────────────────── */}
                <div
                    className="flex-1 relative flex items-center justify-center overflow-hidden group select-none"
                    ref={imageContainerRef}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                >
                    {/* Loading pulse */}
                    {!imgLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
                        </div>
                    )}

                    <img
                        ref={imgRef}
                        key={image.full_path}
                        src={api.images.getRawUrl(image.full_path)}
                        alt={fileName}
                        onLoad={() => setImgLoaded(true)}
                        className="max-w-full max-h-full object-contain will-change-transform"
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                            transition: isDragging ? 'none' : 'transform 0.1s ease',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            opacity: imgLoaded ? 1 : 0,
                        }}
                        draggable={false}
                    />

                    {/* Prev arrow */}
                    {hasPrevious && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onPrevious();
                            }}
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 duration-200"
                            aria-label="Previous"
                        >
                            <ChevronLeft className="w-6 h-6" strokeWidth={2} />
                        </button>
                    )}

                    {/* Next arrow */}
                    {hasNext && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onNext();
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 duration-200"
                            aria-label="Next"
                        >
                            <ChevronRight className="w-6 h-6" strokeWidth={2} />
                        </button>
                    )}

                    {/* Zoom pill — bottom center, visible on hover */}
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-black/60 rounded-full px-1.5 py-1 backdrop-blur-sm border border-white/[0.08] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                            onClick={handleZoomOut}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-white/60 text-xs w-10 text-center font-mono tabular-nums">
                            {Math.round(scale * 100)}%
                        </span>
                        <button
                            onClick={handleZoomIn}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        {scale !== 1 && (
                            <>
                                <div className="w-px h-4 bg-white/15 mx-0.5" />
                                <button
                                    onClick={resetZoom}
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Info panel — exact modern DetailPanel structure ─────── */}
                {showInfo && (
                    <div className="w-[360px] shrink-0 bg-[#0a0a0a] dark:text-gray-200 flex flex-col overflow-hidden">
                        {/* Header — "× Info" — pinned, never scrolls */}
                        <div className="shrink-0 flex place-items-center gap-2 p-2">
                            <button
                                onClick={() => setShowInfo(false)}
                                aria-label="Close"
                                className="flex items-center justify-center w-9 h-9 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" strokeWidth={1.8} />
                            </button>
                            <p className="text-lg text-gray-200">Info</p>
                        </div>
                        {/* Scrollable content body */}
                        <section className="relative flex-1 overflow-y-auto min-h-0">
                            {/* Description Section */}
                            <div className="mt-6 px-4">
                                <SectionHeader>Description</SectionHeader>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Add a description..."
                                    rows={4}
                                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-400/50 transition-colors resize-y min-h-[90px]"
                                />
                            </div>

                            {/* Tags section */}
                            <div className="mt-4 px-4">
                                <SectionHeader
                                    action={
                                        <button
                                            onClick={() =>
                                                document.getElementById('pycasa-tag-input')?.focus()
                                            }
                                            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                            aria-label="Add tag"
                                        >
                                            <Plus className="w-4 h-4" strokeWidth={1.8} />
                                        </button>
                                    }
                                >
                                    Tags
                                </SectionHeader>
                                <form onSubmit={handleAddTag} className="mb-2">
                                    <input
                                        id="pycasa-tag-input"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        placeholder="Add a tag…"
                                        className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-400/50 transition-colors"
                                    />
                                </form>
                                {tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 pt-2">
                                        {tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="flex items-center gap-1 rounded-full border border-white/20 bg-white/[0.06] px-3 py-0.5 text-sm font-light text-gray-200"
                                            >
                                                {tag}
                                                <button
                                                    onClick={() =>
                                                        setTags(tags.filter((t) => t !== tag))
                                                    }
                                                    className="ml-1 text-gray-500 hover:text-white transition-colors"
                                                    aria-label={`Remove tag ${tag}`}
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-600 pt-1">No tags yet</p>
                                )}
                            </div>

                            {/* Albums section */}
                            <div className="mt-4 px-4 border-t border-white/[0.08] pt-4">
                                <SectionHeader
                                    action={
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button
                                                    className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                                    aria-label="Add to album"
                                                >
                                                    <Plus className="w-4 h-4" strokeWidth={1.8} />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-60 p-3 bg-zinc-950 border-zinc-800 text-white shadow-xl rounded-xl space-y-3 z-50">
                                                <div className="space-y-1">
                                                    <p className="text-xs font-semibold text-zinc-400">
                                                        Add to Album
                                                    </p>
                                                    <div className="max-h-32 overflow-y-auto space-y-1 no-scrollbar">
                                                        {allAlbums.length > 0 ? (
                                                            allAlbums.map((album) => {
                                                                const inAlbum = albums.some(
                                                                    (a) => a.id === album.id
                                                                );
                                                                return (
                                                                    <div
                                                                        key={album.id}
                                                                        className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-white/5 text-zinc-200 transition-colors"
                                                                    >
                                                                        <span className="truncate flex-1 pr-2">
                                                                            {album.name}
                                                                        </span>
                                                                        {inAlbum ? (
                                                                            <button
                                                                                onClick={() =>
                                                                                    handleRemoveFromAlbum(
                                                                                        album.id
                                                                                    )
                                                                                }
                                                                                className="text-red-400 hover:text-red-500 p-1 rounded transition-colors shrink-0 hover:bg-red-500/10"
                                                                                title="Remove from album"
                                                                            >
                                                                                <X className="w-3 h-3" />
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() =>
                                                                                    handleAddToAlbum(
                                                                                        album.id
                                                                                    )
                                                                                }
                                                                                className="text-indigo-400 hover:text-indigo-300 p-1 rounded transition-colors shrink-0 hover:bg-indigo-500/10"
                                                                                title="Add to album"
                                                                            >
                                                                                <Plus className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <p className="text-[10px] text-zinc-500 py-2 text-center">
                                                                No albums yet
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="border-t border-white/10 pt-2.5">
                                                    <form
                                                        onSubmit={handleCreateAndAddToAlbum}
                                                        className="space-y-1.5"
                                                    >
                                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                                                            New Album
                                                        </p>
                                                        <div className="flex gap-1">
                                                            <input
                                                                value={newAlbumName}
                                                                onChange={(e) =>
                                                                    setNewAlbumName(e.target.value)
                                                                }
                                                                placeholder="Album name..."
                                                                className="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                                                                disabled={isAddingAlbum}
                                                            />
                                                            <button
                                                                type="submit"
                                                                disabled={
                                                                    isAddingAlbum ||
                                                                    !newAlbumName.trim()
                                                                }
                                                                className="bg-indigo-600 hover:bg-indigo-700 text-white p-1 rounded disabled:opacity-50"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    }
                                >
                                    Albums
                                </SectionHeader>

                                {albums.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 pt-2">
                                        {albums.map((album) => (
                                            <span
                                                key={album.id}
                                                className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-3 py-0.5 text-sm font-light text-gray-200"
                                            >
                                                <FolderClosed className="w-3 h-3 text-zinc-400" />
                                                {album.name}
                                                <button
                                                    onClick={() => handleRemoveFromAlbum(album.id)}
                                                    className="ml-1 text-gray-500 hover:text-white transition-colors"
                                                    aria-label={`Remove from album ${album.name}`}
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-600 pt-1 font-light">
                                        Not in any albums
                                    </p>
                                )}
                            </div>

                            {/* Details section */}
                            <div className="px-4 mt-2">
                                {dateStr ||
                                fileName ||
                                folderPath ||
                                details?.camera_model ||
                                details?.latitude ? (
                                    <SectionHeader>Details</SectionHeader>
                                ) : (
                                    <p className="text-sm text-gray-500 py-2">
                                        No EXIF info available
                                    </p>
                                )}

                                {dateStr && (
                                    <DetailRow
                                        icon={Calendar}
                                        primary={dateStr}
                                        secondary={timeStr}
                                    />
                                )}

                                {fileName && (
                                    <DetailRow
                                        icon={ImageIcon}
                                        primary={fileName}
                                        secondary={[mpStr, dimStr, sizeStr]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        action={
                                            <button
                                                onClick={handleCopyPath}
                                                className="text-gray-500 hover:text-gray-200 transition-colors"
                                                aria-label="Show file location"
                                            >
                                                <ClipboardCopy
                                                    className="w-4 h-4"
                                                    strokeWidth={1.5}
                                                />
                                            </button>
                                        }
                                    />
                                )}

                                {(details?.camera_make || details?.camera_model) && (
                                    <DetailRow
                                        icon={Camera}
                                        primary={
                                            details.camera_model
                                                ? details.camera_model
                                                      .toLowerCase()
                                                      .startsWith(
                                                          details.camera_make?.toLowerCase()
                                                      )
                                                    ? details.camera_model
                                                    : `${details.camera_make} ${details.camera_model}`
                                                : details.camera_make
                                        }
                                        secondary={[
                                            details.shutter_speed,
                                            details.iso ? `ISO ${details.iso}` : '',
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    />
                                )}

                                {(details?.lens_model ||
                                    details?.aperture ||
                                    details?.focal_length) && (
                                    <DetailRow
                                        icon={Aperture}
                                        primary={details.lens_model || 'Lens'}
                                        secondary={[details.aperture, details.focal_length]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    />
                                )}

                                {details?.location_name && (
                                    <DetailRow
                                        icon={MapPin}
                                        primary={
                                            <div className="space-y-0.5">
                                                {details.location_name
                                                    .split(',')
                                                    .map((part, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="text-gray-200 text-sm"
                                                        >
                                                            {part.trim()}
                                                        </div>
                                                    ))}
                                            </div>
                                        }
                                    />
                                )}

                                {!details?.location_name &&
                                    details?.latitude !== null &&
                                    details?.longitude !== null &&
                                    details?.latitude !== undefined && (
                                        <DetailRow
                                            icon={MapPin}
                                            primary={`${details.latitude.toFixed(4)}, ${details.longitude.toFixed(4)}`}
                                        />
                                    )}

                                {details?.latitude !== null &&
                                    details?.longitude !== null &&
                                    details?.latitude !== undefined &&
                                    details?.longitude !== undefined && (
                                        <div className="mt-4 rounded-xl overflow-hidden border border-white/10 h-48 relative">
                                            <Map
                                                height={192}
                                                center={[details.latitude, details.longitude]}
                                                zoom={15}
                                                metaWheelZoom={true}
                                                provider={(x, y, z) => {
                                                    const saved =
                                                        localStorage.getItem('pycasa-map-style');
                                                    const mapStyle =
                                                        saved &&
                                                        ['roadmap', 'hybrid', 'terrain'].includes(
                                                            saved
                                                        )
                                                            ? saved
                                                            : 'hybrid';
                                                    if (mapStyle === 'roadmap') {
                                                        return `https://mt1.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`;
                                                    } else if (mapStyle === 'terrain') {
                                                        return `https://mt1.google.com/vt/lyrs=t&x=${x}&y=${y}&z=${z}`;
                                                    } else {
                                                        return `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`;
                                                    }
                                                }}
                                            >
                                                <Marker
                                                    width={36}
                                                    anchor={[details.latitude, details.longitude]}
                                                    color="#3b82f6"
                                                />
                                            </Map>
                                        </div>
                                    )}

                                {folderPath && <DetailRow icon={FolderIcon} primary={folderPath} />}
                            </div>

                            {/* AI Tools section */}
                            <div className="px-4 mt-2">
                                <SectionHeader>AI Tools</SectionHeader>

                                {/* AI analysis status row */}
                                <div
                                    className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl text-xs font-medium border ${
                                        isBeingAnalyzed
                                            ? 'bg-amber-500/10 border-amber-400/30 text-amber-300'
                                            : image?.ai_failed
                                              ? 'bg-red-500/10 border-red-400/20 text-red-400'
                                              : image?.ai_analysed
                                                ? 'bg-indigo-600/10 border-indigo-400/20 text-indigo-300'
                                                : 'bg-white/[0.03] border-white/[0.06] text-gray-500'
                                    }`}
                                >
                                    {isBeingAnalyzed ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    ) : image?.ai_failed ? (
                                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                    ) : image?.ai_analysed ? (
                                        <img
                                            src="/site-images/ai-icon.png"
                                            alt="AI"
                                            className="w-3.5 h-3.5 shrink-0 object-contain"
                                        />
                                    ) : (
                                        <img
                                            src="/site-images/ai-icon.png"
                                            alt="AI"
                                            className="w-3.5 h-3.5 shrink-0 object-contain opacity-40 grayscale"
                                        />
                                    )}
                                    <span>
                                        {isBeingAnalyzed
                                            ? 'AI analysis in progress…'
                                            : image?.ai_failed
                                              ? `AI analysis failed: ${image?.ai_error || 'Unknown error'}`
                                              : image?.ai_analysed
                                                ? 'AI analysis complete'
                                                : 'Not yet analysed'}
                                    </span>
                                </div>

                                <button
                                    onClick={handleAnalyse}
                                    disabled={isAnalysing}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-40 mb-2"
                                >
                                    <img
                                        src="/site-images/ai-icon.png"
                                        alt=""
                                        className={`w-4 h-4 shrink-0 object-contain ${isAnalysing ? 'animate-spin' : ''}`}
                                    />
                                    {isAnalysing ? 'Analysing…' : 'AI Analyse'}
                                </button>

                                <button
                                    onClick={handleOCR}
                                    disabled={isRunningOCR}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-40"
                                >
                                    <ScanText
                                        className={`w-4 h-4 shrink-0 text-gray-400 ${isRunningOCR ? 'animate-pulse' : ''}`}
                                        strokeWidth={1.6}
                                    />
                                    {isRunningOCR ? 'Scanning…' : 'Extract Text (OCR)'}
                                </button>
                            </div>

                            {/* Save / Delete */}
                            <div className="px-4 mt-6 pb-8 space-y-2">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all disabled:opacity-40"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" strokeWidth={1.8} />
                                    )}
                                    {isSaving ? 'Saving…' : 'Save Changes'}
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 text-sm transition-all"
                                >
                                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                                    Delete
                                </button>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImageDetailModal;
