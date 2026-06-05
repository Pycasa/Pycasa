import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Calendar, Loader2 } from 'lucide-react';
import { Scrubber } from 'react-scrubber';
import 'react-scrubber/lib/scrubber.css';

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

/* ── M3-style vertical timeline slider ──────────────────────────────────── */

const TimelineSlider = ({ groupedSlots, years, activeKey, onNavigate }) => {
    const [hoverPercent, setHoverPercent] = useState(null);
    const [isHovering, setIsHovering] = useState(false);

    const handleMouseMoveTrack = useCallback((e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const percent = Math.max(0, Math.min(100, (y / rect.height) * 100));
        setHoverPercent(percent);
    }, []);

    const handleMouseEnterTrack = useCallback(() => {
        setIsHovering(true);
    }, []);

    const handleMouseLeaveTrack = useCallback(() => {
        setIsHovering(false);
    }, []);

    // Build tick marks: year headers + month entries + day entries
    const ticks = useMemo(() => {
        if (!years.length) return [];
        const items = [];
        years.forEach(year => {
            const y = +year;
            const months = Object.keys(groupedSlots[year] || {}).sort((a, b) => +b - +a);
            months.forEach(month => {
                const m = +month;
                // 1. Month entry
                items.push({
                    type: 'month',
                    year: y,
                    month: m,
                    key: `${y}-${m}`,
                    label: MONTH_NAMES[m],
                    isFirstOfYear: months[0] === month,
                });

                // 2. Day entries for this month
                const days = Object.keys(groupedSlots[year][month] || {}).sort((a, b) => +b - +a);
                days.forEach(day => {
                    const d = +day;
                    items.push({
                        type: 'day',
                        year: y,
                        month: m,
                        day: d,
                        key: `${y}-${m}-${d}`,
                        label: MONTH_NAMES[m],
                        isFirstOfYear: false,
                    });
                });
            });
        });
        return items;
    }, [years, groupedSlots]);

    const activeIndex = useMemo(() => {
        return ticks.findIndex(t => t.key === activeKey);
    }, [ticks, activeKey]);

    const hoverIndex = useMemo(() => {
        if (!isHovering || hoverPercent === null || !ticks.length) return -1;
        return Math.max(0, Math.min(ticks.length - 1, Math.round((hoverPercent / 100) * (ticks.length - 1))));
    }, [hoverPercent, isHovering, ticks]);

    const activeYearIdx = useMemo(() => {
        if (activeIndex === -1) return 0;
        const activeTick = ticks[activeIndex];
        return Math.max(0, years.indexOf(String(activeTick.year)));
    }, [ticks, activeIndex, years]);

    const thumbStyle = useMemo(() => {
        const colors = [
            { main: '#6366f1', shadow: 'rgba(99, 102, 241, 0.4)' }, // Indigo
            { main: '#0ea5e9', shadow: 'rgba(14, 165, 233, 0.4)' }, // Sky
            { main: '#10b981', shadow: 'rgba(16, 185, 129, 0.4)' }, // Emerald
            { main: '#f43f5e', shadow: 'rgba(244, 63, 94, 0.4)' }   // Rose
        ];
        const activeColor = colors[activeYearIdx % 4] || colors[0];
        return {
            '--thumb-color': activeColor.main,
            '--thumb-shadow': activeColor.shadow
        };
    }, [activeYearIdx]);

    const scrubberMarkers = useMemo(() => {
        const list = [];
        
        // 1. Add ranges for each year
        years.forEach((year, yearIdx) => {
            const y = +year;
            const yearTickIndices = [];
            ticks.forEach((tick, idx) => {
                if (tick.year === y) {
                    yearTickIndices.push(idx);
                }
            });
            if (yearTickIndices.length > 0) {
                const firstIdx = yearTickIndices[0]; // newest (closer to top of list, i.e. higher scrubber value)
                const lastIdx = yearTickIndices[yearTickIndices.length - 1]; // oldest (closer to bottom of list, i.e. lower scrubber value)
                
                const startVal = ticks.length - 1 - lastIdx;
                const endVal = ticks.length - 1 - firstIdx;
                
                list.push({
                    start: startVal,
                    end: endVal,
                    className: `year-range year-range-${yearIdx % 4}`
                });
            }
        });

        // 2. Add points for each month and day
        ticks.forEach((tick, idx) => {
            const scrubberVal = ticks.length - 1 - idx;
            if (tick.type === 'month') {
                list.push({
                    start: scrubberVal,
                    className: tick.isFirstOfYear ? 'first-of-year-point' : 'normal-point'
                });
            } else {
                list.push({
                    start: scrubberVal,
                    className: 'day-point'
                });
            }
        });

        return list;
    }, [ticks, years]);

    const handleScrubChange = useCallback((val) => {
        const idx = ticks.length - 1 - Math.round(val);
        const tick = ticks[idx];
        if (tick) {
            onNavigate(tick.key, false); // false = instant scroll
        }
    }, [ticks, onNavigate]);

    const handleScrubEnd = useCallback((val) => {
        const idx = ticks.length - 1 - Math.round(val);
        const tick = ticks[idx];
        if (tick) {
            onNavigate(tick.key, true); // true = smooth scroll to final position
        }
    }, [ticks, onNavigate]);

    if (!ticks.length) return null;

    return (
        <div 
            className="timeline-scrubber-container flex items-stretch h-full py-5 select-none" 
            style={{ width: 96, ...thumbStyle }}
        >
            {/* Custom stylesheet override for react-scrubber to match Pycasa theme */}
            <style>{`
                .timeline-scrubber-container,
                .timeline-scrubber-container .scrubber,
                .timeline-scrubber-container .scrubber * {
                    cursor: ns-resize !important;
                }
                .timeline-scrubber-container .scrubber {
                    height: 100% !important;
                }
                .timeline-scrubber-container .scrubber .bar {
                    background-color: #f1f5f9 !important; /* slate-100 */
                    border-radius: 9999px !important;
                    transition: width 0.2s ease;
                }
                .dark .timeline-scrubber-container .scrubber .bar {
                    background-color: #334155 !important; /* slate-700 */
                }
                .dark .timeline-sidebar {
                    background-color: #1e2229 !important; /* slate-900/85 */
                    border-color: #1e293b !important; /* slate-800 */
                }
                .timeline-scrubber-container .scrubber.vertical .bar {
                    width: 4px !important;
                }
                .timeline-scrubber-container .scrubber.hover.vertical .bar {
                    width: 6px !important;
                }
                .timeline-scrubber-container .scrubber .bar__progress {
                    background-color: transparent !important; /* hide the progress bar to show year range gradients fully */
                }
                .timeline-scrubber-container .scrubber .bar__thumb {
                    background-color: var(--thumb-color, #6366f1) !important;
                    border: 2px solid #ffffff !important;
                    box-shadow: 0 4px 6px -1px var(--thumb-shadow, rgb(99 102 241 / 0.4)), 0 2px 4px -2px var(--thumb-shadow, rgb(99 102 241 / 0.4)) !important;
                    width: 10px !important;
                    height: 10px !important;
                    transition: width 0.15s ease, height 0.15s ease, background-color 0.2s ease, box-shadow 0.2s ease !important;
                }
                .dark .timeline-scrubber-container .scrubber .bar__thumb {
                    border: 2px solid #0f172a !important; /* slate-900 */
                }
                .timeline-scrubber-container .scrubber.hover .bar__thumb {
                    width: 14px !important;
                    height: 14px !important;
                }
                
                /* Range styling */
                .timeline-scrubber-container .scrubber .bar__marker.year-range {
                    width: 100% !important;
                    border-radius: 2px !important;
                }
                .timeline-scrubber-container .scrubber .bar__marker.year-range-0 {
                    background: linear-gradient(to bottom, #818cf8, #4f46e5) !important; /* Indigo gradient */
                }
                .timeline-scrubber-container .scrubber .bar__marker.year-range-1 {
                    background: linear-gradient(to bottom, #38bdf8, #0284c7) !important; /* Sky Blue gradient */
                }
                .timeline-scrubber-container .scrubber .bar__marker.year-range-2 {
                    background: linear-gradient(to bottom, #34d399, #059669) !important; /* Emerald gradient */
                }
                .timeline-scrubber-container .scrubber .bar__marker.year-range-3 {
                    background: linear-gradient(to bottom, #fb7185, #e11d48) !important; /* Rose gradient */
                }

                /* Point styling */
                .timeline-scrubber-container .scrubber .bar__marker.normal-point {
                    background-color: rgba(255, 255, 255, 0.4) !important;
                    height: 1px !important;
                    width: 100% !important;
                    transform: translateY(50%) !important;
                }
                .timeline-scrubber-container .scrubber .bar__marker.first-of-year-point {
                    background-color: rgba(255, 255, 255, 0.85) !important;
                    height: 2px !important;
                    width: 100% !important;
                    transform: translateY(50%) !important;
                }
                .timeline-scrubber-container .scrubber .bar__marker.day-point {
                    background-color: rgba(255, 255, 255, 0.25) !important;
                    height: 1px !important;
                    width: 60% !important; /* Slightly shorter than month lines to make a nice ruler hierarchy */
                    transform: translateY(50%) !important;
                }
            `}</style>

            {/* Left side: Month & Year Labels */}
            <div className="relative flex-1 mr-0 h-full">
                {ticks.map((tick, idx) => {
                    const isActive = idx === activeIndex;
                    const isHoverActive = idx === hoverIndex;
                    const percent = ticks.length > 1 ? (idx / (ticks.length - 1)) * 100 : 0;
                    
                    const isVisible = tick.type === 'month' || isActive || isHoverActive;
                    if (!isVisible) return null;

                    const yearIdx = years.indexOf(String(tick.year));
                    const activeColorClass = 
                        yearIdx % 4 === 0 ? 'text-indigo-600 dark:text-indigo-400' :
                        yearIdx % 4 === 1 ? 'text-sky-600 dark:text-sky-400' :
                        yearIdx % 4 === 2 ? 'text-emerald-600 dark:text-emerald-400' :
                                            'text-rose-600 dark:text-rose-400';

                    const labelText = tick.type === 'day' 
                        ? `${tick.day} ${tick.label} ${tick.year}` 
                        : `${tick.label} ${tick.year}`;

                    return (
                        <div
                            key={tick.key}
                            className="absolute right-0 -translate-y-1/2 flex items-center pointer-events-none transition-all duration-200"
                            style={{ top: `${percent}%` }}
                        >
                            <span
                                className={`
                                    whitespace-nowrap transition-all duration-150
                                    ${tick.type === 'day' ? 'text-[9px]' : 'text-[10px]'}
                                    ${isActive
                                        ? `${activeColorClass} font-bold scale-105`
                                        : isHoverActive
                                            ? 'text-slate-700 font-semibold scale-102'
                                            : 'text-slate-400 font-medium'
                                    }
                                `}
                            >
                                {labelText}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Right side: Scrubber bar */}
            <div 
                className="relative w-8 h-full flex justify-center py-1 cursor-ns-resize"
                onMouseMove={handleMouseMoveTrack}
                onMouseEnter={handleMouseEnterTrack}
                onMouseLeave={handleMouseLeaveTrack}
            >
                <Scrubber
                    min={0}
                    max={ticks.length - 1}
                    value={activeIndex === -1 ? ticks.length - 1 : ticks.length - 1 - activeIndex}
                    vertical
                    markers={scrubberMarkers}
                    onScrubChange={handleScrubChange}
                    onScrubEnd={handleScrubEnd}
                />

                {/* Horizontal line showing pointer position - rendered after Scrubber to stack on top */}
                {isHovering && hoverPercent !== null && (
                    <div 
                        className="absolute right-0 left-0 h-[2px] bg-indigo-500/80 pointer-events-none z-50"
                        style={{ 
                            top: `${hoverPercent}%`,
                            transform: 'translateY(-50%)'
                        }}
                    />
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
const TimelineView = () => {
    const [metadata, setMetadata]           = useState(null);
    const [metadataLoading, setMetadataLoading] = useState(true);
    const [images, setImages]               = useState([]);
    const [loading, setLoading]             = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);
    const [activeKey, setActiveKey]         = useState(null); // "year-month"

    const containerRef  = useRef(null);
    const colCount      = useColumnCount(containerRef);
    const imagesRef     = useRef(images);
    const requestedPagesRef = useRef(new Set());

    // Keep imagesRef in sync so callbacks can read latest values
    useEffect(() => { imagesRef.current = images; }, [images]);

    const selectedImage = selectedImageIndex !== null ? images[selectedImageIndex] : null;
    const setSelectedImage = useCallback((img) => {
        if (!img) {
            setSelectedImageIndex(null);
            return;
        }
        const idx = imagesRef.current.findIndex(x => x?.id === img.id);
        if (idx !== -1) {
            setSelectedImageIndex(idx);
        }
    }, []);

    // ── Data fetching ────────────────────────────────────────────────────────

    const fetchImages = useCallback(async (pageNum) => {
        try {
            const limit = 50;
            const newImages = await api.images.list(null, null, null, 'modified_at', 'DESC', pageNum, limit);
            if (Array.isArray(newImages)) {
                const startIndex = (pageNum - 1) * limit;
                setImages(prev => {
                    const next = [...prev];
                    newImages.forEach((img, i) => {
                        next[startIndex + i] = img;
                    });
                    return next;
                });
            }
        } catch (error) {
            console.error('Failed to fetch images:', error);
            requestedPagesRef.current.delete(pageNum);
        }
    }, []);

    useEffect(() => {
        const loadTimeline = async () => {
            setMetadataLoading(true);
            try {
                const meta = await api.images.getMetadata();
                setMetadata(meta);
                setMetadataLoading(false);
                requestedPagesRef.current.add(1);
                await fetchImages(1);
            } catch (error) {
                console.error('Failed to load timeline:', error);
            } finally {
                setMetadataLoading(false);
            }
        };
        loadTimeline();
    }, [fetchImages]);

    // ── Derived state ────────────────────────────────────────────────────────

    const totalImageCount = useMemo(
        () => Object.values(metadata || {}).reduce((sum, v) => sum + v, 0),
        [metadata]
    );

    // Initialize images sparse array once totalImageCount is known
    useEffect(() => {
        if (totalImageCount > 0) {
            setImages(new Array(totalImageCount).fill(null));
            requestedPagesRef.current.clear();
        }
    }, [totalImageCount]);

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
            if (!groups[year])            groups[year]          = {};
            if (!groups[year][month])     groups[year][month]   = {};
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

    /** Fast lookup: "year-month" or "year-month-day" → flat row index (for scrollToIndex) */
    const monthKeyToIndex = useMemo(() => {
        const map = {};
        flatRows.forEach((row, i) => {
            if (row.type === 'month-header') {
                map[`${row.year}-${row.month}`] = i;
            } else if (row.type === 'day-header') {
                map[`${row.year}-${row.month}-${row.day}`] = i;
            }
        });
        return map;
    }, [flatRows]);

    /** Fast lookup: year → flat row index of year-header */
    const yearToIndex = useMemo(() => {
        const map = {};
        flatRows.forEach((row, i) => {
            if (row.type === 'year-header' && !(row.year in map)) {
                map[row.year] = i;
            }
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
                case 'image-row':    return 180;
                default:             return 200;
            }
        },
        overscan: 4,
        measureElement: (el) => el?.getBoundingClientRect().height ?? 200,
        onChange: (instance) => {
            const virtualItems = instance.getVirtualItems();
            if (!virtualItems.length) return;

            // ── Sidebar sync ──────────────────────────────────────────────────
            const scrollTop = containerRef.current?.scrollTop ?? 0;
            let newActive = null;

            for (const item of virtualItems) {
                const row = flatRows[item.index];
                if ((row?.type === 'month-header' || row?.type === 'day-header') && item.start <= scrollTop + 80) {
                    newActive = row.type === 'day-header' 
                        ? `${row.year}-${row.month}-${row.day}` 
                        : `${row.year}-${row.month}`;
                }
            }
            if (!newActive) {
                for (let i = (virtualItems[0]?.index ?? 0) - 1; i >= 0; i--) {
                    const row = flatRows[i];
                    if (row?.type === 'month-header' || row?.type === 'day-header') {
                        newActive = row.type === 'day-header'
                            ? `${row.year}-${row.month}-${row.day}`
                            : `${row.year}-${row.month}`;
                        break;
                    }
                }
            }
            setActiveKey(newActive);

            // ── On-Demand Visible Page Loading ───────────────────────────────
            const limit = 50;
            const pagesToLoad = new Set();
            virtualItems.forEach(item => {
                const row = flatRows[item.index];
                if (row?.type === 'image-row') {
                    row.slots.forEach(slot => {
                        if (!imagesRef.current[slot.index]) {
                            const pageNum = Math.floor(slot.index / limit) + 1;
                            pagesToLoad.add(pageNum);
                        }
                    });
                }
            });

            pagesToLoad.forEach(pageNum => {
                if (!requestedPagesRef.current.has(pageNum)) {
                    requestedPagesRef.current.add(pageNum);
                    fetchImages(pageNum);
                }
            });
        },
    });

    // ── Navigation ───────────────────────────────────────────────────────────

    const handleNavigateToMonth = useCallback((monthKey, smooth = true) => {
        const index = monthKeyToIndex[monthKey];
        if (index !== undefined) {
            rowVirtualizer.scrollToIndex(index, { 
                align: 'start', 
                behavior: smooth ? 'smooth' : 'auto' 
            });
        }
    }, [monthKeyToIndex, rowVirtualizer]);

    // Trigger page loading if navigating to an unloaded index in the modal
    useEffect(() => {
        if (selectedImageIndex !== null && !images[selectedImageIndex]) {
            const pageNum = Math.floor(selectedImageIndex / 50) + 1;
            if (!requestedPagesRef.current.has(pageNum)) {
                requestedPagesRef.current.add(pageNum);
                fetchImages(pageNum);
            }
        }
    }, [selectedImageIndex, images, fetchImages]);

    const modalImage = useMemo(() => {
        if (!selectedImage) return null;
        return { ...selectedImage, full_path: selectedImage.file_path, modified: selectedImage.modified_at };
    }, [selectedImage]);

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
        <div className="relative flex h-[calc(100vh-4rem)] bg-white dark:bg-slate-950 overflow-hidden">

            {/* ── Scrollable timeline area ─────────────────────────────────── */}
            <div
                ref={containerRef}
                className="flex-grow overflow-y-auto no-scrollbar"
                style={{ paddingRight: '6.5rem' /* make room for the fixed 96px sidebar */ }}
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
                    <div className="flex items-center justify-center h-full text-slate-400">
                        No photos found.
                    </div>
                )}
            </div>

            {/* ── Right sidebar — M3 Timeline Slider ──────────────────────── */}
            <div
                className="absolute right-0 top-0 bottom-0 flex items-stretch bg-white/80 backdrop-blur-sm border-l border-slate-100 dark:border-slate-800 timeline-sidebar"
                style={{ zIndex: 10 }}
            >
                <TimelineSlider
                    groupedSlots={groupedSlots}
                    years={years}
                    activeKey={activeKey}
                    onNavigate={handleNavigateToMonth}
                />
            </div>

            {/* ── Image detail modal ───────────────────────────────────────── */}
            <ImageDetailModal
                image={modalImage}
                isOpen={selectedImageIndex !== null}
                onClose={() => setSelectedImageIndex(null)}
                onUpdate={() => {
                    if (selectedImageIndex !== null) {
                        const pageNum = Math.floor(selectedImageIndex / 50) + 1;
                        fetchImages(pageNum);
                    }
                }}
                onNext={() => {
                    if (selectedImageIndex !== null && selectedImageIndex < images.length - 1) {
                        setSelectedImageIndex(prev => prev + 1);
                    }
                }}
                onPrevious={() => {
                    if (selectedImageIndex !== null && selectedImageIndex > 0) {
                        setSelectedImageIndex(prev => prev - 1);
                    }
                }}
                hasNext={selectedImageIndex !== null && selectedImageIndex < images.length - 1}
                hasPrevious={selectedImageIndex !== null && selectedImageIndex > 0}
            />
        </div>
    );
};

export default TimelineView;
