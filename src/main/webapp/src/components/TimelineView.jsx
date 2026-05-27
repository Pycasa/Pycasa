import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Loader2, Calendar } from 'lucide-react';

const TimelineView = () => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [activeKey, setActiveKey] = useState(null); // format: "year-month"
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const containerRef = useRef(null);
    const monthRefs = useRef({});

    // Initial load
    useEffect(() => {
        fetchImages(1);
    }, []);

    const fetchImages = async (pageNum) => {
        if (loading) return; // Prevent multiple requests

        setLoading(true);
        try {
            const limit = 30;
            const newImages = await api.images.list(null, null, null, 'modified_at', 'DESC', pageNum, limit);

            if (Array.isArray(newImages)) {
                if (pageNum === 1) {
                    setImages(newImages);
                } else {
                    setImages(prev => {
                        // Avoid duplicates if any by ID
                        const existingIds = new Set(prev.map(img => img.id));
                        const uniqueNew = newImages.filter(img => !existingIds.has(img.id));
                        return [...prev, ...uniqueNew];
                    });
                }

                if (newImages.length < limit) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
                }
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

    const groupedImages = useMemo(() => {
        const groups = {};
        // Images are already sorted by modified DESC from DB, but let's ensure client sort too
        const sortedImages = [...images].sort((a, b) => b.modified_at - a.modified_at);

        sortedImages.forEach(img => {
            const date = new Date(img.modified_at); // DB uses 'modified_at'
            const year = date.getFullYear();
            const month = date.getMonth(); // 0-11

            if (!groups[year]) groups[year] = {};
            if (!groups[year][month]) groups[year][month] = [];
            groups[year][month].push(img);
        });

        return groups;
    }, [images]);

    const years = useMemo(() => Object.keys(groupedImages).sort((a, b) => b - a), [groupedImages]);

    // Scroll synchronization & Infinite Scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;

            // Infinite Scroll Trigger
            if (scrollHeight - scrollTop - clientHeight < 500) {
                if (hasMore && !loading) {
                    loadMore();
                }
            }

            let currentActive = null;

            // Find which month is currently most visible at the top
            for (const key in monthRefs.current) {
                const element = monthRefs.current[key];
                if (element) {
                    const offsetTop = element.offsetTop - container.offsetTop;
                    if (offsetTop <= scrollTop + 100) {
                        currentActive = key;
                    }
                }
            }
            setActiveKey(currentActive);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [years, groupedImages, hasMore, loading, loadMore]);

    const scrollToMonth = (year, month) => {
        const key = `${year}-${month}`;
        const element = monthRefs.current[key];
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // Find next available
            const availableMonths = Object.keys(groupedImages[year] || {}).map(Number).sort((a, b) => b - a);
            const nextMonth = availableMonths.find(m => m <= month) || availableMonths[availableMonths.length - 1];
            if (nextMonth !== undefined) {
                const nextKey = `${year}-${nextMonth}`;
                monthRefs.current[nextKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const modalImage = useMemo(() => {
        if (!selectedImage) return null;
        return {
            ...selectedImage,
            full_path: selectedImage.file_path,
            modified: selectedImage.modified_at
        };
    }, [selectedImage]);

    if (loading && images.length === 0) {
        return (
            <div className="h-full min-h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="relative flex h-[calc(100vh-4rem)] bg-white overflow-hidden">
            {/* Timeline Content */}
            <div
                ref={containerRef}
                className="flex-grow overflow-y-auto p-8 scroll-smooth pr-20 no-scrollbar"
            >
                {years.length > 0 ? (
                    years.map(year => (
                        <div key={year} className="mb-20">
                            {Object.keys(groupedImages[year])
                                .sort((a, b) => b - a)
                                .map(month => (
                                    <div
                                        key={`${year}-${month}`}
                                        ref={el => monthRefs.current[`${year}-${month}`] = el}
                                        className="mb-12 scroll-mt-24"
                                    >
                                        <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <Calendar className="w-4 h-4 text-primary" />
                                            </div>
                                            {monthNames[month]} {year}
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-1">
                                            {groupedImages[year][month].map(image => (
                                                <ImageCard
                                                    key={image.id || image.file_path}
                                                    className="border border-red-900 pb-10 bg-red-900"
                                                    image={{ ...image, full_path: image.file_path, modified: image.modified_at, size: image.file_size }} // Map DB fields to frontend expected
                                                    isSelected={selectedImage?.id === image.id}
                                                    onSelect={(img) => setSelectedImage(img)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <Calendar className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No images found in your timeline.</p>
                        <p className="text-sm">Try adding more folders in Settings.</p>
                    </div>
                )}
                {loading && images.length > 0 && (
                    <div className="py-8 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                )}
            </div>

            {/* Side Navigation */}
            <div className="absolute right-0 top-0 bottom-0 w-48 z-30 overflow-y-auto no-scrollbar select-none pointer-events-auto">
                <div className="flex flex-col items-center py-8 ml-auto w-16 bg-slate-50 border-l border-slate-100 min-h-full">
                    <div className="flex flex-col gap-8">
                        {years.map(year => (
                            <div key={`nav-${year}`} className="flex flex-col items-center gap-2">
                                <div className="flex flex-col items-center gap-1.5 mb-2">
                                    <button
                                        onClick={() => scrollToMonth(year, 11)}
                                        className={`text-[11px] font-black transition-all ${activeKey?.startsWith(year) ? 'text-primary scale-110' : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                    >
                                        {year}
                                    </button>
                                    <div className={`w-12 h-1.5 rounded-full transition-all ${activeKey?.startsWith(year) ? 'bg-primary shadow-[0_0_8px_rgba(26,67,50,0.3)]' : 'bg-slate-200'}`} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    {[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(m => {
                                        const hasImages = groupedImages[year] && groupedImages[year][m];
                                        const isActive = activeKey === `${year}-${m}`;

                                        return (
                                            <div
                                                key={`nav-${year}-${m}`}
                                                className="group relative flex items-center justify-center"
                                            >
                                                <button
                                                    onClick={() => scrollToMonth(year, m)}
                                                    className={`w-5 h-1 rounded-full transition-all flex-shrink-0 ${isActive
                                                        ? 'bg-primary w-8 h-1.5 shadow-[0_0_10px_rgba(26,67,50,0.2)]'
                                                        : hasImages
                                                            ? 'bg-primary/30 hover:bg-primary/60 hover:w-7'
                                                            : 'bg-slate-200/50 hover:bg-slate-300 hover:w-7'
                                                        }`}
                                                />
                                                <span className={`absolute right-full mr-4 px-2.5 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm text-white text-[10px] whitespace-nowrap opacity-0 pointer-events-none transition-all translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 z-40 shadow-xl border border-white/10 font-medium`}>
                                                    {monthNames[m]} {year}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <ImageDetailModal
                image={modalImage}
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                onUpdate={() => fetchImages(1)}
                onNext={() => {
                    const allSortedImages = years.flatMap(y =>
                        Object.keys(groupedImages[y]).sort((a, b) => b - a).flatMap(m => groupedImages[y][m])
                    );
                    const currentIndex = allSortedImages.findIndex(img => img.id === selectedImage?.id);
                    if (currentIndex < allSortedImages.length - 1) {
                        setSelectedImage(allSortedImages[currentIndex + 1]);
                    }
                }}
                onPrevious={() => {
                    const allSortedImages = years.flatMap(y =>
                        Object.keys(groupedImages[y]).sort((a, b) => b - a).flatMap(m => groupedImages[y][m])
                    );
                    const currentIndex = allSortedImages.findIndex(img => img.id === selectedImage?.id);
                    if (currentIndex > 0) {
                        setSelectedImage(allSortedImages[currentIndex - 1]);
                    }
                }}
                hasNext={selectedImage && (() => {
                    const allSortedImages = years.flatMap(y =>
                        Object.keys(groupedImages[y]).sort((a, b) => b - a).flatMap(m => groupedImages[y][m])
                    );
                    return allSortedImages.findIndex(img => img.id === selectedImage.id) < allSortedImages.length - 1;
                })()}
                hasPrevious={selectedImage && (() => {
                    const allSortedImages = years.flatMap(y =>
                        Object.keys(groupedImages[y]).sort((a, b) => b - a).flatMap(m => groupedImages[y][m])
                    );
                    return allSortedImages.findIndex(img => img.id === selectedImage.id) > 0;
                })()}
            />
        </div>
    );
};

export default TimelineView;
