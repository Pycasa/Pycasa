import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import Navbar from './Navbar';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Loader2, Image as ImageIcon, Search, Filter, SortAsc, SortDesc, Tag as TagIcon, Folder as FolderIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const ImageManager = () => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const containerRef = useRef(null);

    // Filter States
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [folderId, setFolderId] = useState('all');
    const [sortBy, setSortBy] = useState('modified_at');
    const [sortOrder, setSortOrder] = useState('DESC');
    const [selectedTags, setSelectedTags] = useState([]);
    const [tagSearchQuery, setTagSearchQuery] = useState('');

    // Options
    const [availableTags, setAvailableTags] = useState([]);
    const [monitoredFolders, setMonitoredFolders] = useState([]);

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
    }, [debouncedSearch, folderId, selectedTags, sortBy, sortOrder]);

    const fetchInitialData = async () => {
        try {
            const [tags, folders] = await Promise.all([
                api.images.getTags(),
                api.folders.listMonitored()
            ]);
            setAvailableTags(tags || []);
            setMonitoredFolders(folders || []);
        } catch (error) {
            console.error("Failed to fetch filter options:", error);
        }
    };

    const fetchImages = async (pageNum, isReset = false) => {
        if (loading && !isReset) return;

        setLoading(true);
        try {
            const limit = 30;
            const fId = folderId === 'all' ? null : folderId;
            const newImages = await api.images.list(fId, debouncedSearch, selectedTags, sortBy, sortOrder, pageNum, limit);

            if (Array.isArray(newImages)) {
                if (pageNum === 1) {
                    setImages(newImages);
                    if (containerRef.current) containerRef.current.scrollTop = 0;
                } else {
                    setImages(prev => {
                        const existingIds = new Set(prev.map(img => img.id));
                        const uniqueNew = newImages.filter(img => !existingIds.has(img.id));
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
        setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    };

    const toggleTag = (tag) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const clearFilters = () => {
        setSearch('');
        setFolderId('all');
        setSelectedTags([]);
        setSortBy('modified_at');
        setSortOrder('DESC');
    };

    const modalImage = useMemo(() => {
        if (!selectedImage) return null;
        return {
            ...selectedImage,
            full_path: selectedImage.file_path,
            modified: selectedImage.modified_at,
            size: selectedImage.file_size,
        };
    }, [selectedImage]);

    if (loading && images.length === 0 && !debouncedSearch && folderId === 'all' && selectedTags.length === 0) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-white">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 overflow-hidden">
            {/* Filter Bar */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 space-y-4 shadow-sm z-10">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Search */}
                    <div className="relative flex-grow max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search images by name or description..."
                            className="pl-10 text-sm h-10 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Folder Filter */}
                    <Select value={folderId} onValueChange={setFolderId}>
                        <SelectTrigger className="w-[200px] h-10 text-sm bg-slate-50 border-slate-200">
                            <div className="flex items-center gap-2">
                                <FolderIcon className="w-4 h-4 text-slate-400" />
                                <SelectValue placeholder="All Folders" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Folders</SelectItem>
                            {monitoredFolders.map(folder => (
                                <SelectItem key={folder.id} value={folder.id}>
                                    {folder.label || folder.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Sort By */}
                    <div className="flex items-center gap-1">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[180px] h-10 text-sm bg-slate-50 border-slate-200">
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-slate-400" />
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
                            {sortOrder === 'DESC' ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
                        </Button>
                    </div>

                    {/* Tags Filter Dropdown */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={`h-10 px-4 text-sm bg-slate-50 border-slate-200 transition-all active:scale-95 ${selectedTags.length > 0 ? "border-primary text-primary" : "text-slate-600"
                                    }`}
                            >
                                <TagIcon className="w-4 h-4 mr-2" />
                                Tags
                                {selectedTags.length > 0 && (
                                    <Badge variant="secondary" className="ml-2 bg-primary text-white border-none px-1.5 h-5 text-[10px]">
                                        {selectedTags.length}
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0 shadow-xl border-slate-200" align="start">
                            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Filter by Tags</span>
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
                                        className="h-8 pl-8 text-xs border-slate-200 focus:border-slate-300 focus:ring-0 transition-colors bg-white"
                                        placeholder="Search tags..."
                                        value={tagSearchQuery}
                                        onChange={(e) => setTagSearchQuery(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2 no-scrollbar">
                                {availableTags.filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase())).length > 0 ? (
                                    <div className="space-y-1">
                                        {availableTags
                                            .filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                                            .map(tag => (
                                                <div
                                                    key={tag}
                                                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 transition-colors cursor-pointer group"
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
                                                        className="text-sm font-medium leading-none cursor-pointer flex-grow text-slate-600 group-hover:text-slate-900 transition-colors"
                                                    >
                                                        {tag}
                                                    </Label>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-xs text-slate-400">
                                        {tagSearchQuery ? "No matching tags" : "No tags available"}
                                    </div>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {(search || folderId !== 'all' || selectedTags.length > 0) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-500 text-xs h-10"
                            onClick={clearFilters}
                        >
                            <X className="w-4 h-4 mr-1.5" />
                            Clear Filters
                        </Button>
                    )}
                </div>

                {/* Selected Tags Display */}
                {selectedTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-50 mt-4">
                        {selectedTags.map(tag => (
                            <Badge
                                key={tag}
                                variant="default"
                                className="bg-white text-primary border border-primary/20 shadow-sm px-2 py-0.5 text-[10px] flex items-center gap-1.5 group hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                                onClick={() => toggleTag(tag)}
                            >
                                {tag}
                                <X className="w-3 h-3 text-slate-400 group-hover:text-red-500" />
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-8 no-scrollbar"
            >
                {images.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                        {images.map(image => (
                            <ImageCard
                                key={image.id || image.file_path}
                                image={{ ...image, full_path: image.file_path, modified: image.modified_at, size: image.file_size }}
                                isSelected={selectedImage?.id === image.id}
                                onSelect={(img) => setSelectedImage(img)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No images found.</p>
                        <p className="text-sm">Try adding folders in Settings.</p>
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
                    const currentIndex = images.findIndex(img => img.id === selectedImage?.id);
                    if (currentIndex < images.length - 1) {
                        setSelectedImage(images[currentIndex + 1]);
                    }
                }}
                onPrevious={() => {
                    const currentIndex = images.findIndex(img => img.id === selectedImage?.id);
                    if (currentIndex > 0) {
                        setSelectedImage(images[currentIndex - 1]);
                    }
                }}
                hasNext={selectedImage && (() => {
                    return images.findIndex(img => img.id === selectedImage.id) < images.length - 1;
                })()}
                hasPrevious={selectedImage && (() => {
                    return images.findIndex(img => img.id === selectedImage.id) > 0;
                })()}
            />
        </div>
    );
};

export default ImageManager;
