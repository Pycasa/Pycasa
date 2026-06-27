import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import {
    Loader2,
    Image as ImageIcon,
    Search,
    Filter,
    SortAsc,
    SortDesc,
    Tag as TagIcon,
    Folder as FolderIcon,
    X,
    Calendar,
    HardDrive,
    FileType,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import MiniCalendar from './MiniCalendar';

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_EXTENSIONS = [
    { group: 'JPEG', exts: ['jpg', 'jpeg'] },
    { group: 'PNG', exts: ['png'] },
    { group: 'GIF', exts: ['gif'] },
    { group: 'WebP', exts: ['webp'] },
    { group: 'HEIC', exts: ['heic', 'heif'] },
    { group: 'TIFF', exts: ['tiff', 'tif'] },
    { group: 'BMP', exts: ['bmp'] },
    { group: 'RAW', exts: ['raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2'] },
    { group: 'SVG', exts: ['svg'] },
    { group: 'AVIF', exts: ['avif'] },
];

const SIZE_PRESETS = [
    { label: 'Any size', min: null, max: null },
    { label: '< 500 KB', min: null, max: 500_000 },
    { label: '500 KB – 2 MB', min: 500_000, max: 2_000_000 },
    { label: '2 MB – 10 MB', min: 2_000_000, max: 10_000_000 },
    { label: '> 10 MB', min: 10_000_000, max: null },
];

// ─── Component ────────────────────────────────────────────────────────────────

const ImageManager = () => {
    const location = useLocation();
    const queryParam = new URLSearchParams(location.search).get('q') || '';

    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const containerRef = useRef(null);

    // Filter States
    const [search, setSearch] = useState(queryParam);
    const [debouncedSearch, setDebouncedSearch] = useState(queryParam);
    const [folderId, setFolderId] = useState('all');
    const [sortBy, setSortBy] = useState('modified_at');
    const [sortOrder, setSortOrder] = useState('DESC');
    const [selectedTags, setSelectedTags] = useState([]);
    const [tagSearchQuery, setTagSearchQuery] = useState('');
    const [gridSize, setGridSize] = useState(
        () => localStorage.getItem('pycasa-grid-size') || 'md'
    );

    // Sync search input when url query parameter changes (e.g. from global search)
    useEffect(() => {
        setSearch(queryParam);
    }, [queryParam]);

    // Sync grid size selection to local storage
    useEffect(() => {
        localStorage.setItem('pycasa-grid-size', gridSize);
    }, [gridSize]);

    // New filter states
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedExtGroups, setSelectedExtGroups] = useState([]); // group labels
    const [sizePresetIdx, setSizePresetIdx] = useState(0);

    // Options
    const [availableTags, setAvailableTags] = useState([]);
    const [monitoredFolders, setMonitoredFolders] = useState([]);

    // Derived active-filter counts for badge display
    const dateActive = !!(dateFrom || dateTo);
    const extActive = selectedExtGroups.length > 0;
    const sizeActive = sizePresetIdx !== 0;

    // Search Debounce
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        fetchImages(1, true);
    }, [
        debouncedSearch,
        folderId,
        selectedTags,
        sortBy,
        sortOrder,
        dateFrom,
        dateTo,
        selectedExtGroups,
        sizePresetIdx,
    ]);

    const fetchInitialData = async () => {
        try {
            const [tags, folders] = await Promise.all([
                api.images.getTags(),
                api.folders.listMonitored(),
            ]);
            setAvailableTags(tags || []);
            setMonitoredFolders(folders || []);
        } catch (error) {
            console.error('Failed to fetch filter options:', error);
        }
    };

    const fetchImages = async (pageNum, isReset = false) => {
        if (loading && !isReset) return;

        setLoading(true);
        try {
            const limit = 30;
            const fId = folderId === 'all' ? null : folderId;

            // Resolve date range — date_from is start of day, date_to is end of day
            const dateFromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
            const dateToMs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;

            // Resolve extensions from selected groups
            const extensions =
                selectedExtGroups.length > 0
                    ? selectedExtGroups.flatMap(
                          (g) => KNOWN_EXTENSIONS.find((k) => k.group === g)?.exts ?? []
                      )
                    : null;

            // Resolve size range from preset
            const { min: sizeMin, max: sizeMax } = SIZE_PRESETS[sizePresetIdx];

            const newImages = await api.images.list(
                fId,
                debouncedSearch,
                selectedTags,
                sortBy,
                sortOrder,
                pageNum,
                limit,
                dateFromMs,
                dateToMs,
                extensions,
                sizeMin,
                sizeMax
            );

            if (Array.isArray(newImages)) {
                if (pageNum === 1) {
                    setImages(newImages);
                    if (containerRef.current) containerRef.current.scrollTop = 0;
                } else {
                    setImages((prev) => {
                        const existingIds = new Set(prev.map((img) => img.id));
                        const uniqueNew = newImages.filter((img) => !existingIds.has(img.id));
                        return [...prev, ...uniqueNew];
                    });
                }

                setHasMore(newImages.length === limit);
                setPage(pageNum);
            }
        } catch (error) {
            console.error('Failed to fetch images:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMore = useCallback(() => {
        if (!loading && hasMore) {
            fetchImages(page + 1);
        }
    }, [loading, hasMore, page]);

    // Infinite Scroll Trigger
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;

            if (scrollHeight - scrollTop - clientHeight < 500) {
                if (hasMore && !loading) {
                    loadMore();
                }
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [hasMore, loading, loadMore]);

    const toggleSortOrder = () => {
        setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    };

    const toggleTag = (tag) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    const toggleExtGroup = (group) => {
        setSelectedExtGroups((prev) =>
            prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
        );
    };

    const clearFilters = () => {
        setSearch('');
        setFolderId('all');
        setSelectedTags([]);
        setSortBy('modified_at');
        setSortOrder('DESC');
        setDateFrom('');
        setDateTo('');
        setSelectedExtGroups([]);
        setSizePresetIdx(0);
    };

    const hasActiveFilters =
        search ||
        folderId !== 'all' ||
        selectedTags.length > 0 ||
        dateFrom ||
        dateTo ||
        selectedExtGroups.length > 0 ||
        sizePresetIdx !== 0;

    const modalImage = useMemo(() => {
        if (!selectedImage) return null;
        return {
            ...selectedImage,
            full_path: selectedImage.file_path,
            modified: selectedImage.modified_at,
            size: selectedImage.file_size,
        };
    }, [selectedImage]);

    if (
        loading &&
        images.length === 0 &&
        !debouncedSearch &&
        folderId === 'all' &&
        selectedTags.length === 0
    ) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-white dark:bg-slate-900">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 overflow-hidden">
            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-8 py-4 space-y-4 shadow-sm z-10">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Folder Filter */}
                    <Select value={folderId} onValueChange={setFolderId}>
                        <SelectTrigger className="w-[180px] h-10 text-xs bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600">
                            <div className="flex items-center gap-2">
                                <FolderIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                <SelectValue placeholder="All Folders" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Folders</SelectItem>
                            {monitoredFolders.map((folder) => (
                                <SelectItem key={folder.id} value={folder.id}>
                                    {folder.label || folder.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Sort By */}
                    <div className="flex items-center gap-1">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[160px] h-10 text-xs bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600">
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                                    <SelectValue placeholder="Sort By" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="modified_at">Date Modified</SelectItem>
                                <SelectItem value="created_at">Date Created</SelectItem>
                                <SelectItem value="size">File Size</SelectItem>
                                <SelectItem value="file_path">File Name</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-slate-500 hover:text-primary transition-colors"
                            onClick={toggleSortOrder}
                        >
                            {sortOrder === 'DESC' ? (
                                <SortDesc className="w-4 h-4" />
                            ) : (
                                <SortAsc className="w-4 h-4" />
                            )}
                        </Button>
                    </div>

                    {/* ── Date Range Filter ── */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={`h-10 px-3 text-xs bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 transition-all active:scale-95 ${dateActive ? 'border-primary text-primary' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                                <Calendar className="w-4 h-4 mr-2" />
                                Date
                                {dateActive && (
                                    <Badge
                                        variant="secondary"
                                        className="ml-2 bg-primary text-white border-none px-1.5 h-5 text-[10px]"
                                    >
                                        On
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-56 p-0 shadow-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800"
                            align="start"
                        >
                            <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    Date Range
                                </span>
                                {dateActive && (
                                    <button
                                        onClick={() => {
                                            setDateFrom('');
                                            setDateTo('');
                                        }}
                                        className="text-[10px] font-medium text-red-500 hover:text-red-600"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                            <div className="p-3 space-y-3">
                                <div>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 block font-bold uppercase tracking-wider">
                                        From{' '}
                                        {dateFrom && (
                                            <span className="normal-case font-normal ml-1 text-primary">
                                                {dateFrom}
                                            </span>
                                        )}
                                    </span>
                                    <MiniCalendar
                                        value={dateFrom || null}
                                        maxDate={dateTo || null}
                                        onChange={setDateFrom}
                                    />
                                </div>
                                <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 block font-bold uppercase tracking-wider">
                                        To{' '}
                                        {dateTo && (
                                            <span className="normal-case font-normal ml-1 text-primary">
                                                {dateTo}
                                            </span>
                                        )}
                                    </span>
                                    <MiniCalendar
                                        value={dateTo || null}
                                        minDate={dateFrom || null}
                                        onChange={setDateTo}
                                    />
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* ── File Type / Extension Filter ── */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={`h-10 px-3 text-xs bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 transition-all active:scale-95 ${extActive ? 'border-primary text-primary' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                                <FileType className="w-4 h-4 mr-2" />
                                Type
                                {extActive && (
                                    <Badge
                                        variant="secondary"
                                        className="ml-2 bg-primary text-white border-none px-1.5 h-5 text-[10px]"
                                    >
                                        {selectedExtGroups.length}
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-56 p-0 shadow-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800"
                            align="start"
                        >
                            <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    File Type
                                </span>
                                {extActive && (
                                    <button
                                        onClick={() => setSelectedExtGroups([])}
                                        className="text-[10px] font-medium text-red-500 hover:text-red-600"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="p-2 space-y-1">
                                {KNOWN_EXTENSIONS.map(({ group, exts }) => (
                                    <div
                                        key={group}
                                        className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                                        onClick={() => toggleExtGroup(group)}
                                    >
                                        <Checkbox
                                            id={`ext-${group}`}
                                            checked={selectedExtGroups.includes(group)}
                                            onCheckedChange={() => toggleExtGroup(group)}
                                            className="border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        <div className="flex-1 flex items-center justify-between">
                                            <Label
                                                htmlFor={`ext-${group}`}
                                                className="text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-200"
                                            >
                                                {group}
                                            </Label>
                                            <span className="text-[10px] text-slate-400 w-[84px]">
                                                {exts.join(', ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* ── File Size Filter ── */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={`h-10 px-3 text-xs bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 transition-all active:scale-95 ${sizeActive ? 'border-primary text-primary' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                                <HardDrive className="w-4 h-4 mr-2" />
                                Size
                                {sizeActive && (
                                    <Badge
                                        variant="secondary"
                                        className="ml-2 bg-primary text-white border-none px-1.5 h-5 text-[10px]"
                                    >
                                        On
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-52 p-0 shadow-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800"
                            align="start"
                        >
                            <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    File Size
                                </span>
                                {sizeActive && (
                                    <button
                                        onClick={() => setSizePresetIdx(0)}
                                        className="text-[10px] font-medium text-red-500 hover:text-red-600"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="p-2 space-y-1">
                                {SIZE_PRESETS.map((preset, idx) => (
                                    <div
                                        key={preset.label}
                                        className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                                        onClick={() => setSizePresetIdx(idx)}
                                    >
                                        <div
                                            className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${sizePresetIdx === idx ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-500'}`}
                                        />
                                        <span
                                            className={`text-xs ${sizePresetIdx === idx ? 'font-semibold text-primary' : 'text-slate-700 dark:text-slate-200'}`}
                                        >
                                            {preset.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* ── Tags Filter ── */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={`h-10 px-3 text-xs bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 transition-all active:scale-95 ${selectedTags.length > 0 ? 'border-primary text-primary' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                                <TagIcon className="w-4 h-4 mr-2" />
                                Tags
                                {selectedTags.length > 0 && (
                                    <Badge
                                        variant="secondary"
                                        className="ml-2 bg-primary text-white border-none px-1.5 h-5 text-[10px]"
                                    >
                                        {selectedTags.length}
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-64 p-0 shadow-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800"
                            align="start"
                        >
                            <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                        Filter by Tags
                                    </span>
                                    {selectedTags.length > 0 && (
                                        <button
                                            onClick={() => setSelectedTags([])}
                                            className="text-[10px] font-medium text-red-500 hover:text-red-600 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <Input
                                        className="h-8 pl-8 text-xs border-slate-200 dark:border-slate-600 focus:border-slate-300 focus:ring-0 transition-colors bg-white dark:bg-slate-700"
                                        placeholder="Search tags..."
                                        value={tagSearchQuery}
                                        onChange={(e) => setTagSearchQuery(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2 no-scrollbar">
                                {availableTags.filter((t) =>
                                    t.toLowerCase().includes(tagSearchQuery.toLowerCase())
                                ).length > 0 ? (
                                    <div className="space-y-1">
                                        {availableTags
                                            .filter((t) =>
                                                t
                                                    .toLowerCase()
                                                    .includes(tagSearchQuery.toLowerCase())
                                            )
                                            .map((tag) => (
                                                <div
                                                    key={tag}
                                                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        toggleTag(tag);
                                                    }}
                                                >
                                                    <Checkbox
                                                        id={`tag-${tag}`}
                                                        checked={selectedTags.includes(tag)}
                                                        onCheckedChange={() => toggleTag(tag)}
                                                        className="border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                    />
                                                    <Label
                                                        htmlFor={`tag-${tag}`}
                                                        className="text-xs font-medium leading-none cursor-pointer flex-grow text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors"
                                                    >
                                                        {tag}
                                                    </Label>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-xs text-slate-400">
                                        {tagSearchQuery ? 'No matching tags' : 'No tags available'}
                                    </div>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-500 text-xs h-10"
                            onClick={clearFilters}
                        >
                            <X className="w-4 h-4 mr-1.5" />
                            Clear All
                        </Button>
                    )}
                </div>

                {/* Active filter chips row */}
                {(selectedTags.length > 0 ||
                    selectedExtGroups.length > 0 ||
                    dateActive ||
                    sizeActive) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        {selectedTags.map((tag) => (
                            <Badge
                                key={tag}
                                variant="default"
                                className="bg-white dark:bg-slate-700 text-primary border border-primary/20 shadow-sm px-2 py-0.5 text-[10px] flex items-center gap-1.5 group hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                                onClick={() => toggleTag(tag)}
                            >
                                <TagIcon className="w-2.5 h-2.5" />
                                {tag}
                                <X className="w-3 h-3 text-slate-400 group-hover:text-red-500" />
                            </Badge>
                        ))}
                        {selectedExtGroups.map((group) => (
                            <Badge
                                key={group}
                                variant="default"
                                className="bg-white dark:bg-slate-700 text-indigo-600 border border-indigo-200 dark:border-indigo-800 shadow-sm px-2 py-0.5 text-[10px] flex items-center gap-1.5 group hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                                onClick={() => toggleExtGroup(group)}
                            >
                                <FileType className="w-2.5 h-2.5" />
                                {group}
                                <X className="w-3 h-3 text-slate-400 group-hover:text-red-500" />
                            </Badge>
                        ))}
                        {dateActive && (
                            <Badge
                                variant="default"
                                className="bg-white dark:bg-slate-700 text-amber-600 border border-amber-200 dark:border-amber-800 shadow-sm px-2 py-0.5 text-[10px] flex items-center gap-1.5 group hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                                onClick={() => {
                                    setDateFrom('');
                                    setDateTo('');
                                }}
                            >
                                <Calendar className="w-2.5 h-2.5" />
                                {dateFrom || '…'} → {dateTo || '…'}
                                <X className="w-3 h-3 text-slate-400 group-hover:text-red-500" />
                            </Badge>
                        )}
                        {sizeActive && (
                            <Badge
                                variant="default"
                                className="bg-white dark:bg-slate-700 text-teal-600 border border-teal-200 dark:border-teal-800 shadow-sm px-2 py-0.5 text-[10px] flex items-center gap-1.5 group hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                                onClick={() => setSizePresetIdx(0)}
                            >
                                <HardDrive className="w-2.5 h-2.5" />
                                {SIZE_PRESETS[sizePresetIdx].label}
                                <X className="w-3 h-3 text-slate-400 group-hover:text-red-500" />
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            <div ref={containerRef} className="flex-1 overflow-y-auto p-8 no-scrollbar relative">
                {images.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {images.map((image) => {
                            const rHeight = gridSize === 'sm' ? 120 : gridSize === 'lg' ? 240 : 180;
                            return (
                                <ImageCard
                                    key={image.id || image.file_path}
                                    rowHeight={rHeight}
                                    image={{
                                        ...image,
                                        full_path: image.file_path,
                                        modified: image.modified_at,
                                        size: image.file_size,
                                    }}
                                    isSelected={selectedImage?.id === image.id}
                                    onSelect={(img) => setSelectedImage(img)}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No images found.</p>
                        <p className="text-sm">
                            Try adjusting your filters or adding folders in Settings.
                        </p>
                    </div>
                )}

                {/* ── Dynamic Grid Size Selector floating pill (Google Photos zoom style) ── */}
                {images.length > 0 && (
                    <div className="fixed bottom-5 right-10 flex items-center bg-white/90 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-800/80 rounded-full shadow-lg p-1.5 z-20 space-x-1.5 backdrop-blur-md select-none scale-90 sm:scale-100">
                        <button
                            onClick={() => setGridSize('sm')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${
                                gridSize === 'sm'
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            Small
                        </button>
                        <button
                            onClick={() => setGridSize('md')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${
                                gridSize === 'md'
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            Medium
                        </button>
                        <button
                            onClick={() => setGridSize('lg')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${
                                gridSize === 'lg'
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            Large
                        </button>
                    </div>
                )}
                {loading && images.length > 0 && (
                    <div className="py-8 flex justify-center w-full">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                )}
            </div>

            <ImageDetailModal
                image={modalImage}
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                onUpdate={() => fetchImages(1)}
                onNext={() => {
                    const currentIndex = images.findIndex((img) => img.id === selectedImage?.id);
                    if (currentIndex < images.length - 1) {
                        setSelectedImage(images[currentIndex + 1]);
                    }
                }}
                onPrevious={() => {
                    const currentIndex = images.findIndex((img) => img.id === selectedImage?.id);
                    if (currentIndex > 0) {
                        setSelectedImage(images[currentIndex - 1]);
                    }
                }}
                hasNext={
                    selectedImage &&
                    (() => {
                        return (
                            images.findIndex((img) => img.id === selectedImage.id) <
                            images.length - 1
                        );
                    })()
                }
                hasPrevious={
                    selectedImage &&
                    (() => {
                        return images.findIndex((img) => img.id === selectedImage.id) > 0;
                    })()
                }
            />
        </div>
    );
};

export default ImageManager;
