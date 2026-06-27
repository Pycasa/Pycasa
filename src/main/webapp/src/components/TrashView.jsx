import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Trash2, Loader2, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_LIMIT = 50;

const TrashView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [selectedImageIndex, setSelectedImageIndex] = useState(null);
    const [directModalImage, setDirectModalImage] = useState(null);
    const imagesRef = useRef([]);

    // Keep imagesRef in sync so callbacks can read latest values
    useEffect(() => {
        imagesRef.current = images;
    }, [images]);

    // Load page from backend
    const loadPage = useCallback(async (pageNum, reset = false) => {
        setLoading(true);
        try {
            const data = await api.images.listTrashed(pageNum, PAGE_LIMIT);
            const normalized = (data || []).map((img) => ({
                ...img,
                full_path: img.file_path,
                modified: img.modified_at,
                size: img.file_size,
            }));
            setImages((prev) => (reset ? normalized : [...prev, ...normalized]));
            setHasMore(normalized.length === PAGE_LIMIT);
        } catch (err) {
            console.error('Failed to load trashed images:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        loadPage(1, true);
    }, [loadPage]);

    // Infinite scroll observer
    const observer = useRef(null);
    const lastElementRef = useCallback(
        (node) => {
            if (loading) return;
            if (observer.current) observer.current.disconnect();
            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    const next = page + 1;
                    setPage(next);
                    loadPage(next, false);
                }
            });
            if (node) observer.current.observe(node);
        },
        [loading, hasMore, page, loadPage]
    );

    // Sync route /photos/:id with modal state
    useEffect(() => {
        if (!id) {
            setSelectedImageIndex(null);
            setDirectModalImage(null);
            return;
        }

        const idx = imagesRef.current.findIndex((img) => img?.id === id);
        if (idx !== -1) {
            setSelectedImageIndex(idx);
            setDirectModalImage(null);
        } else {
            api.images
                .getMetadata(null, id)
                .then((img) => {
                    if (img) {
                        setDirectModalImage(img);
                        setSelectedImageIndex(null);
                    }
                })
                .catch((err) => console.error('Error fetching photo details for modal:', err));
        }
    }, [id, images]);

    const selectedImage =
        selectedImageIndex !== null ? images[selectedImageIndex] : directModalImage;

    const ROW_HEIGHT = 200;
    const isEmpty = !loading && images.length === 0;

    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20">
            {/* Header bar */}
            <div className="sticky top-0 z-20 flex items-center gap-3 px-6 py-4 bg-white/80 dark:bg-[#060913]/80 backdrop-blur border-b border-slate-200/60 dark:border-white/[0.06]">
                <Trash2 className="w-5 h-5 text-red-500" />
                <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white">Trash</h1>
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
                            <div className="w-20 h-20 rounded-full bg-red-500/10 dark:bg-red-500/[0.08] flex items-center justify-center">
                                <Trash2 className="w-9 h-9 text-red-400/60" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[15px] font-semibold text-slate-700 dark:text-white/80">
                                Trash is empty
                            </p>
                            <p className="text-[13px] text-slate-400 dark:text-white/30 max-w-xs leading-relaxed">
                                Photos you delete from Pycasa will be moved here. You can choose to
                                restore them or delete them permanently.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mosaic grid */}
            {images.length > 0 && (
                <div className="p-4">
                    <div className="flex flex-wrap gap-0.5" style={{ alignItems: 'flex-start' }}>
                        {images.map((img, index) => {
                            const isLast = index === images.length - 1;
                            return (
                                <div
                                    key={img.id || img.full_path}
                                    ref={isLast ? lastElementRef : null}
                                >
                                    <ImageCard
                                        image={img}
                                        isSelected={selectedImage?.id === img.id}
                                        onSelect={(selected) => {
                                            navigate(`/photos/${selected.id}`, {
                                                state: { background: '/trash' },
                                            });
                                        }}
                                        rowHeight={ROW_HEIGHT}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Loading spinner */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-red-400/60" />
                </div>
            )}

            {selectedImage && (
                <ImageDetailModal
                    image={selectedImage}
                    isOpen={!!id}
                    onClose={() => navigate('/trash')}
                    onUpdate={() => {
                        loadPage(1, true);
                    }}
                    onNext={() => {
                        if (selectedImageIndex !== null && selectedImageIndex < images.length - 1) {
                            const nextImg = images[selectedImageIndex + 1];
                            if (nextImg)
                                navigate(`/photos/${nextImg.id}`, {
                                    replace: true,
                                    state: location.state,
                                });
                        }
                    }}
                    onPrevious={() => {
                        if (selectedImageIndex !== null && selectedImageIndex > 0) {
                            const prevImg = images[selectedImageIndex - 1];
                            if (prevImg)
                                navigate(`/photos/${prevImg.id}`, {
                                    replace: true,
                                    state: location.state,
                                });
                        }
                    }}
                    hasNext={selectedImageIndex !== null && selectedImageIndex < images.length - 1}
                    hasPrevious={selectedImageIndex !== null && selectedImageIndex > 0}
                />
            )}
        </div>
    );
};

export default TrashView;
