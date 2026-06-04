import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Loader2, Calendar } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PlaceholderCard = () => (
    <div className="border-2 border-transparent rounded-none aspect-[4/3] bg-slate-100 animate-pulse" />
);

/** Returns the responsive column count based on the container element's width. */
function useColumnCount(containerRef) {
    const [cols, setCols] = useState(4);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const compute = (w) => {
            if (w < 640) return 2;
            if (w < 1024) return 3;
            if (w < 1280) return 4;
            if (w < 1536) return 6;
            return 8;
        };
        const obs = new ResizeObserver(entries => {
            setCols(compute(entries[0].contentRect.width));
        });
        obs.observe(el);
        setCols(compute(el.getBoundingClientRect().width));
        return () => obs.disconnect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return cols;
}

// ─────────────────────────────────────────────────────────────────────────────
const TimelineView = () => {
    const [metadata, setMetadata]           = useState(null);
    const [metadataLoading, setMetadataLoading] = useState(true);
    const [images, setImages]               = useState([]);
    const [loading, setLoading]             = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [activeKey, setActiveKey]         = useState(null); // "year-month"
    const [page, setPage]                   = useState(1);

    const containerRef  = useRef(null);
    const colCount      = useColumnCount(containerRef);
    const loadingRef    = useRef(loading);
    const hasMoreRef    = useRef(false);
    const pageRef       = useRef(page);

    // Keep refs in sync so stable callbacks can read latest values
    useEffect(() => { loadingRef.current = loading; }, [loading]);
    useEffect(() => { pageRef.current    = page;    }, [page]);

    // ── Data fetching ────────────────────────────────────────────────────────

    const fetchImages = useCallback(async (pageNum) => {
        if (loadingRef.current) return;
        setLoading(true);
        try {
            const limit = 50;
            const newImages = await api.images.list(null, null, null, 'modified_at', 'DESC', pageNum, limit);
            if (Array.isArray(newImages)) {
                if (pageNum === 1) {
                    setImages(newImages);
                } else {
                    setImages(prev => {
                        const existingIds = new Set(prev.map(img => img.id));
                        return [...prev, ...newImages.filter(img => !existingIds.has(img.id))];
                    });
                }
                setPage(pageNum);
            }
        } catch (error) {
            console.error('Failed to fetch images:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadTimeline = async () => {
            setMetadataLoading(true);
            try {
                const meta = await api.images.getMetadata();
                setMetadata(meta);
                setMetadataLoading(false);
                await fetchImages(1);
            } catch (error) {
                console.error('Failed to load timeline:', error);
            } finally {
                setMetadataLoading(false);
                setLoading(false);
            }
        };
        loadTimeline();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived state ────────────────────────────────────────────────────────

    const totalImageCount = useMemo(
        () => Object.values(metadata || {}).reduce((sum, v) => sum + v, 0),
        [metadata]
    );

    // Keep hasMoreRef in sync so the onChange callback (stable) can read it
    const hasMore = images.length < totalImageCount;
    useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

    /** Slots grouped as year → month → day → [slot] with a global index */
    const groupedSlots = useMemo(() => {
        if (!metadata) return {};
        const groups = {};
        let globalIndex = 0;
        const sortedDates = Object.keys(metadata).sort((a, b) => b.localeCompare(a));
        sortedDates.forEach(dateStr => {
            const count = metadata[dateStr];
            if (count <= 0) return;
            const date  = new Date(dateStr + 'T00:00:00');
            const year  = date.getFullYear();
            const month = date.getMonth();
            const day   = date.getDate();
            if (!groups[year])          groups[year]          = {};
            if (!groups[year][month])   groups[year][month]   = {};
            if (!groups[year][month][day]) groups[year][month][day] = [];
            for (let i = 0; i < count; i++) {
                groups[year][month][day].push({ index: globalIndex++, dateStr, year, month, day });
            }
        });
        return groups;
    }, [metadata]);

    const years = useMemo(
        () => Object.keys(groupedSlots).sort((a, b) => b - a),
        [groupedSlots]
    );

    /**
     * A flat ordered array of typed "row" objects that the virtualizer renders:
     *   year-header   → shows the year label (e.g., "2024")
     *   month-header  → shows "Jan 2024" — used for sidebar sync
     *   day-header    → shows "4 Jun 2024"
     *   image-row     → a single grid row of up to colCount images
     */
    const flatRows = useMemo(() => {
        const rows = [];
        years.forEach(year => {
            rows.push({ type: 'year-header', year, key: `year-${year}` });
            const months = Object.keys(groupedSlots[year]).sort((a, b) => b - a);
            months.forEach(month => {
                rows.push({ type: 'month-header', year: +year, month: +month, key: `${year}-${month}` });
                const days = Object.keys(groupedSlots[year][month]).sort((a, b) => +b - +a);
                days.forEach(day => {
                    rows.push({ type: 'day-header', year: +year, month: +month, day: +day, key: `${year}-${month}-${day}` });
                    const slots = groupedSlots[year][month][day];
                    for (let i = 0; i < slots.length; i += colCount) {
                        rows.push({
                            type: 'image-row',
                            year: +year, month: +month, day: +day,
                            slots: slots.slice(i, i + colCount),
                            key: `${year}-${month}-${day}-r${i}`,
                        });
                    }
                });
            });
        });
        return rows;
    }, [groupedSlots, years, colCount]);

    /** Fast lookup: "year-month" → flat row index (for scrollToIndex) */
    const monthKeyToIndex = useMemo(() => {
        const map = {};
        flatRows.forEach((row, i) => {
            if (row.type === 'month-header') map[`${row.year}-${row.month}`] = i;
        });
        return map;
    }, [flatRows]);

    // ── Virtualizer ─────────────────────────────────────────────────────────

    const rowVirtualizer = useVirtualizer({
        count: flatRows.length,
        getScrollElement: () => containerRef.current,
        estimateSize: (i) => {
            const row = flatRows[i];
            if (!row) return 200;
            switch (row.type) {
                case 'year-header':  return 72;
                case 'month-header': return 48;
                case 'day-header':   return 52;
                case 'image-row':    return 180; // rough estimate; measureElement overrides
                default:             return 200;
            }
        },
        overscan: 4,
        // measureElement lets the virtualizer read actual DOM heights on first render
        measureElement: (el) => el?.getBoundingClientRect().height ?? 200,
        onChange: (instance) => {
            const virtualItems = instance.getVirtualItems();
            if (!virtualItems.length) return;

            // ── Sidebar sync ──────────────────────────────────────────────────
            const scrollTop = containerRef.current?.scrollTop ?? 0;
            let newActive = null;

            // Walk visible items; track last month-header whose top is above viewport midpoint
            for (const item of virtualItems) {
                const row = flatRows[item.index];
                if (row?.type === 'month-header' && item.start <= scrollTop + 80) {
                    newActive = `${row.year}-${row.month}`;
                }
            }
            // If nothing matched yet, scan backwards from the first visible item
            if (!newActive) {
                for (let i = (virtualItems[0]?.index ?? 0) - 1; i >= 0; i--) {
                    const row = flatRows[i];
                    if (row?.type === 'month-header') {
                        newActive = `${row.year}-${row.month}`;
                        break;
                    }
                }
            }
            setActiveKey(newActive);

            // ── Infinite scroll ────────────────────────────────────────────────
            const lastItem = virtualItems[virtualItems.length - 1];
            if (lastItem && lastItem.index >= flatRows.length - 8 && hasMoreRef.current && !loadingRef.current) {
                fetchImages(pageRef.current + 1);
            }
        },
    });

    // ── Navigation ───────────────────────────────────────────────────────────

    const scrollToMonth = useCallback((year, month) => {
        const key = `${year}-${month}`;
        const idx = monthKeyToIndex[key];
        if (idx !== undefined) {
            rowVirtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
            return;
        }
        // Fallback: closest available month
        const available = Object.keys(groupedSlots[year] || {}).map(Number).sort((a, b) => b - a);
        const nearest   = available.find(m => m <= month) ?? available[available.length - 1];
        if (nearest !== undefined) {
            const fi = monthKeyToIndex[`${year}-${nearest}`];
            if (fi !== undefined) rowVirtualizer.scrollToIndex(fi, { align: 'start', behavior: 'smooth' });
        }
    }, [monthKeyToIndex, rowVirtualizer, groupedSlots]);

    // ── Modal helpers ────────────────────────────────────────────────────────

    const modalImage = useMemo(() => {
        if (!selectedImage) return null;
        return { ...selectedImage, full_path: selectedImage.file_path, modified: selectedImage.modified_at };
    }, [selectedImage]);

    const currentImageIndex = useMemo(
        () => images.findIndex(img => img.id === selectedImage?.id),
        [images, selectedImage]
    );

    // ── Render ───────────────────────────────────────────────────────────────

    if (metadataLoading) {
        return (
            <div className="h-full min-h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    const virtualItems = rowVirtualizer.getVirtualItems();
    const totalSize    = rowVirtualizer.getTotalSize();

    return (
        <div className="relative flex h-[calc(100vh-4rem)] bg-white overflow-hidden">

            {/* ── Scrollable timeline area ─────────────────────────────────── */}
            <div
                ref={containerRef}
                className="flex-grow overflow-y-auto no-scrollbar"
                style={{ paddingRight: '4rem' /* make room for the fixed 64px sidebar */ }}
            >
                {years.length > 0 ? (
                    <div style={{ height: totalSize, position: 'relative' }}>
                        {virtualItems.map(virtualItem => {
                            const row = flatRows[virtualItem.index];
                            if (!row) return null;

                            return (
                                <div
                                    key={row.key}
                                    data-index={virtualItem.index}
                                    ref={rowVirtualizer.measureElement}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }}
                                >
                                    {/* Year header */}
                                    {row.type === 'year-header' && (
                                        <div className="px-8 pt-10 pb-2">
                                            <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                                                {row.year}
                                            </h2>
                                        </div>
                                    )}

                                    {/* Month header */}
                                    {row.type === 'month-header' && (
                                        <div className="px-8 pt-5 pb-1">
                                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                                                {MONTH_NAMES[row.month]} {row.year}
                                            </p>
                                        </div>
                                    )}

                                    {/* Day header */}
                                    {row.type === 'day-header' && (
                                        <div className="px-8 pt-4 pb-2">
                                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                    <Calendar className="w-3 h-3 text-primary" />
                                                </div>
                                                {row.day} {MONTH_NAMES[row.month]} {row.year}
                                            </h3>
                                        </div>
                                    )}

                                    {/* Image grid row */}
                                    {row.type === 'image-row' && (
                                        <div className="px-8 pb-0">
                                            <div
                                                className="grid gap-0"
                                                style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
                                            >
                                                {row.slots.map(slot => {
                                                    const image = images[slot.index];
                                                    return image ? (
                                                        <ImageCard
                                                            key={image.id || image.file_path}
                                                            image={{
                                                                ...image,
                                                                full_path: image.file_path,
                                                                modified:  image.modified_at,
                                                                size:      image.file_size,
                                                            }}
                                                            isSelected={selectedImage?.id === image.id}
                                                            onSelect={img => setSelectedImage(img)}
                                                        />
                                                    ) : (
                                                        <PlaceholderCard key={`ph-${slot.index}`} />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
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

            {/* ── Fixed right sidebar ──────────────────────────────────────── */}
            <div className="absolute right-0 top-0 bottom-0 w-16 z-30 flex flex-col bg-slate-50 border-l border-slate-100 overflow-y-auto no-scrollbar select-none">
                <div className="flex flex-col items-center py-8 gap-8 flex-1">
                    {years.map(year => (
                        <div key={`nav-${year}`} className="flex flex-col items-center gap-2">
                            {/* Year button */}
                            <div className="flex flex-col items-center gap-1.5 mb-1">
                                <button
                                    onClick={() => scrollToMonth(year, 11)}
                                    className={`text-[11px] font-black transition-all ${
                                        activeKey?.startsWith(String(year))
                                            ? 'text-primary scale-110'
                                            : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    {year}
                                </button>
                                <div className={`w-10 h-1.5 rounded-full transition-all ${
                                    activeKey?.startsWith(String(year))
                                        ? 'bg-primary shadow-[0_0_8px_rgba(26,67,50,0.3)]'
                                        : 'bg-slate-200'
                                }`} />
                            </div>

                            {/* Month markers (Dec → Jan) */}
                            <div className="flex flex-col gap-1.5">
                                {[11,10,9,8,7,6,5,4,3,2,1,0].map(m => {
                                    const hasImages = groupedSlots[year]?.[m] &&
                                        Object.keys(groupedSlots[year][m]).length > 0;
                                    const isActive  = activeKey === `${year}-${m}`;
                                    return (
                                        <div
                                            key={`nav-${year}-${m}`}
                                            className="group relative flex items-center justify-center"
                                        >
                                            <button
                                                onClick={() => scrollToMonth(year, m)}
                                                className={`h-1 rounded-full transition-all flex-shrink-0 ${
                                                    isActive
                                                        ? 'w-8 h-1.5 bg-primary shadow-[0_0_10px_rgba(26,67,50,0.2)]'
                                                        : hasImages
                                                            ? 'w-5 bg-primary/30 hover:bg-primary/60 hover:w-7'
                                                            : 'w-5 bg-slate-200/50 hover:bg-slate-300 hover:w-7'
                                                }`}
                                            />
                                            <span className="absolute right-full mr-3 px-2.5 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm text-white text-[10px] whitespace-nowrap opacity-0 pointer-events-none transition-all translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 z-40 shadow-xl border border-white/10 font-medium">
                                                {MONTH_NAMES[m]} {year}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Image detail modal ───────────────────────────────────────── */}
            <ImageDetailModal
                image={modalImage}
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                onUpdate={() => fetchImages(1)}
                onNext={() => {
                    if (currentImageIndex < images.length - 1) {
                        setSelectedImage(images[currentImageIndex + 1]);
                    }
                }}
                onPrevious={() => {
                    if (currentImageIndex > 0) {
                        setSelectedImage(images[currentImageIndex - 1]);
                    }
                }}
                hasNext={currentImageIndex < images.length - 1}
                hasPrevious={currentImageIndex > 0}
            />
        </div>
    );
};

export default TimelineView;
