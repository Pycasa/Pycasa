import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Heart, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_LIMIT = 50;

const FavoritesView = () => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);
    const containerRef = useRef(null);
    const sentinelRef = useRef(null);

    // ── Load page ──────────────────────────────────────────────────────────────
    const loadPage = useCallback(async (pageNum, reset = false) => {
        setLoading(true);
        try {
            const data = await api.images.listFavorites(pageNum, PAGE_LIMIT);
            const normalized = (data || []).map((img) => ({
                ...img,
                full_path: img.file_path,
                modified: img.modified_at,
                size: img.file_size,
            }));
            setImages((prev) => (reset ? normalized : [...prev, ...normalized]));
            setHasMore(normalized.length === PAGE_LIMIT);
        } catch (err) {
            console.error('Failed to load favorites:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        loadPage(1, true);
    }, [loadPage]);

    // ── Infinite scroll ────────────────────────────────────────────────────────
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    const next = page + 1;
                    setPage(next);
                    loadPage(next, false);
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loading, page, loadPage]);

    // ── When a favorite is un-hearted inside this view, remove from list ──────
    const handleFavoriteToggle = (updated) => {
        const isFav = updated.favorite;
        if (!isFav) {
            setImages((prev) => prev.filter((img) => img.id !== updated.id));
        }
    };

    // ── Row height for the mosaic grid ─────────────────────────────────────────
    const ROW_HEIGHT = 200;

    // ── Empty state ────────────────────────────────────────────────────────────
    const isEmpty = !loading && images.length === 0;

    return (
        <div
            ref={containerRef}
            className="h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20"
        >
            {/* Header bar */}
            <div className="sticky top-0 z-20 flex items-center gap-3 px-6 py-4 bg-white/80 dark:bg-[#060913]/80 backdrop-blur border-b border-slate-200/60 dark:border-white/[0.06]">
                <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
                <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Favorites
                </h1>
                {images.length > 0 && (
                    <span className="text-[12px] text-slate-400 dark:text-white/30 ml-1">
                        {images.length}
                        {hasMore ? '+' : ''} photo{images.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Empty state */}
            <AnimatePresence>
                {isEmpty && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="flex flex-col items-center justify-center gap-5 py-32 px-6 text-center"
                    >
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full bg-rose-500/10 dark:bg-rose-500/[0.08] flex items-center justify-center">
                                <Heart className="w-9 h-9 text-rose-400/60" />
                            </div>
                            {/* Subtle ping ring */}
                            <span className="absolute inset-0 rounded-full border border-rose-400/20 animate-ping" />
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[15px] font-semibold text-slate-700 dark:text-white/80">
                                No favorites yet
                            </p>
                            <p className="text-[13px] text-slate-400 dark:text-white/30 max-w-xs leading-relaxed">
                                Hover over any photo and click the{' '}
                                <Heart className="w-3 h-3 inline fill-rose-500 text-rose-500" />{' '}
                                heart to add it here.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mosaic grid */}
            {images.length > 0 && (
                <div className="p-4">
                    <div className="flex flex-wrap gap-0.5" style={{ alignItems: 'flex-start' }}>
                        {images.map((img) => (
                            <ImageCard
                                key={img.id || img.full_path}
                                image={img}
                                isSelected={selectedImage?.id === img.id}
                                onSelect={setSelectedImage}
                                rowHeight={ROW_HEIGHT}
                                onFavoriteToggle={handleFavoriteToggle}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {/* Loading spinner */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-rose-400/60" />
                </div>
            )}

            {selectedImage && (
                <ImageDetailModal
                    image={selectedImage}
                    isOpen={!!selectedImage}
                    onClose={() => setSelectedImage(null)}
                    onUpdate={() => {
                        // Refresh the list of favorites
                        loadPage(1, true);
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
                        images.findIndex((img) => img.id === selectedImage.id) < images.length - 1
                    }
                    hasPrevious={images.findIndex((img) => img.id === selectedImage.id) > 0}
                />
            )}
        </div>
    );
};

export default FavoritesView;
