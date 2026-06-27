import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import { Calendar, Loader2 } from 'lucide-react';
import { Scrubber } from 'react-scrubber';
import 'react-scrubber/lib/scrubber.css';

const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const PlaceholderCard = ({ rowHeight = 180 }) => (
    <div
        className="rounded-none bg-slate-200 dark:bg-slate-800 animate-pulse flex-grow"
        style={{
            height: `${rowHeight}px`,
            width: `${rowHeight * 1.4}px`,
            flexBasis: `${rowHeight * 1.4}px`,
            flexGrow: 1.4,
        }}
    />
);

/** Returns the responsive column count based on the container element's width. */
function useColumnCount(containerRef, gridSize = 'md') {
    const [cols, setCols] = useState(4);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const compute = (w) => {
            let base = 4;
            if (w < 640) base = 2;
            else if (w < 1024) base = 3;
            else if (w < 1280) base = 4;
            else if (w < 1536) base = 6;
            else base = 8;

            if (gridSize === 'sm') {
                return Math.round(base * 1.5);
            } else if (gridSize === 'lg') {
                return Math.max(1, Math.round(base * 0.65));
            }
            return base;
        };
        const obs = new ResizeObserver((entries) => {
            setCols(compute(entries[0].contentRect.width));
        });
        obs.observe(el);
        setCols(compute(el.getBoundingClientRect().width));
        return () => obs.disconnect();
    }, [gridSize]); // eslint-disable-line react-hooks/exhaustive-deps
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
        years.forEach((year) => {
            const y = +year;
            const months = Object.keys(groupedSlots[year] || {}).sort((a, b) => +b - +a);
            months.forEach((month) => {
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
                days.forEach((day) => {
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
        return ticks.findIndex((t) => t.key === activeKey);
    }, [ticks, activeKey]);

    const hoverIndex = useMemo(() => {
        if (!isHovering || hoverPercent === null || !ticks.length) return -1;
        return Math.max(
            0,
            Math.min(ticks.length - 1, Math.round((hoverPercent / 100) * (ticks.length - 1)))
        );
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
            { main: '#f43f5e', shadow: 'rgba(244, 63, 94, 0.4)' }, // Rose
        ];
        const activeColor = colors[activeYearIdx % 4] || colors[0];
        return {
            '--thumb-color': activeColor.main,
            '--thumb-shadow': activeColor.shadow,
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
                    className: `year-range year-range-${yearIdx % 4}`,
                });
            }
        });

        // 2. Add points for each month and day
        ticks.forEach((tick, idx) => {
            const scrubberVal = ticks.length - 1 - idx;
            if (tick.type === 'month') {
                list.push({
                    start: scrubberVal,
                    className: tick.isFirstOfYear ? 'first-of-year-point' : 'normal-point',
                });
            } else {
                list.push({
                    start: scrubberVal,
                    className: 'day-point',
                });
            }
        });

        return list;
    }, [ticks, years]);

    const handleScrubChange = useCallback(
        (val) => {
            const idx = ticks.length - 1 - Math.round(val);
            const tick = ticks[idx];
            if (tick) {
                onNavigate(tick.key, false); // false = instant scroll
            }
        },
        [ticks, onNavigate]
    );

    const handleScrubEnd = useCallback(
        (val) => {
            const idx = ticks.length - 1 - Math.round(val);
            const tick = ticks[idx];
            if (tick) {
                onNavigate(tick.key, true); // true = smooth scroll to final position
            }
        },
        [ticks, onNavigate]
    );

    if (!ticks.length) return null;

    return (
        <div
            className="timeline-scrubber-container flex items-stretch h-full py-5 select-none pointer-events-auto"
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
                    background-color: rgba(241, 245, 249, 0.15) !important; /* light slate border-line */
                    border-radius: 9999px !important;
                    transition: width 0.2s ease;
                }
                .dark .timeline-scrubber-container .scrubber .bar {
                    background-color: rgba(255, 255, 255, 0.15) !important; /* dark slate border-line */
                }
                .timeline-scrubber-container .scrubber.vertical .bar {
                    width: 2px !important;
                }
                .timeline-scrubber-container .scrubber.hover.vertical .bar {
                    width: 4px !important;
                }
                .timeline-scrubber-container .scrubber .bar__progress {
                    background-color: transparent !important;
                }
                .timeline-scrubber-container .scrubber .bar__thumb {
                    background-color: var(--thumb-color, #6366f1) !important;
                    border: 2px solid #ffffff !important;
                    box-shadow: 0 4px 6px -1px var(--thumb-shadow, rgb(99 102 241 / 0.4)) !important;
                    width: 10px !important;
                    height: 10px !important;
                    transition: width 0.15s ease, height 0.15s ease, background-color 0.2s ease !important;
                }
                .dark .timeline-scrubber-container .scrubber .bar__thumb {
                    border: 2px solid #09090b !important;
                }
                .timeline-scrubber-container .scrubber.hover .bar__thumb {
                    width: 12px !important;
                    height: 12px !important;
                }

                /* Point markers */
                .timeline-scrubber-container .scrubber .bar__marker.normal-point {
                    background-color: rgba(255, 255, 255, 0.15) !important;
                    height: 1px !important;
                    width: 100% !important;
                    transform: translateY(50%) !important;
                }
                .timeline-scrubber-container .scrubber .bar__marker.first-of-year-point {
                    background-color: rgba(255, 255, 255, 0.45) !important;
                    height: 1px !important;
                    width: 100% !important;
                    transform: translateY(50%) !important;
                }
                .timeline-scrubber-container .scrubber .bar__marker.day-point {
                    background-color: transparent !important; /* hide day ticks to keep slider line uncluttered */
                }
            `}</style>

            {/* Left side: Pure Year Labels (modern layout) */}
            <div className="relative flex-1 mr-2 h-full">
                {ticks.map((tick, idx) => {
                    const isActive = idx === activeIndex;
                    const percent = ticks.length > 1 ? (idx / (ticks.length - 1)) * 100 : 0;

                    // ONLY render the year tag at the start of a year block
                    const isVisible = tick.isFirstOfYear;
                    if (!isVisible) return null;

                    const yearIdx = years.indexOf(String(tick.year));
                    const activeColorClass =
                        yearIdx % 4 === 0
                            ? 'text-indigo-500'
                            : yearIdx % 4 === 1
                              ? 'text-sky-500'
                              : yearIdx % 4 === 2
                                ? 'text-emerald-500'
                                : 'text-rose-500';

                    return (
                        <div
                            key={tick.key}
                            className="absolute right-0 -translate-y-1/2 flex items-center pointer-events-none transition-all duration-200"
                            style={{ top: `${percent}%` }}
                        >
                            <span
                                className={`
                                    whitespace-nowrap transition-all duration-150 font-sans text-[11px] font-bold tracking-wider
                                    ${
                                        isActive
                                            ? `${activeColorClass} scale-110`
                                            : 'text-slate-400 dark:text-slate-600'
                                    }
                                `}
                            >
                                {tick.year}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Right side: Scrubber bar */}
            <div
                className="relative w-6 h-full flex justify-center py-1 cursor-ns-resize pointer-events-auto"
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

                {/* Floating Date Badge on Hover (modern style) */}
                {isHovering && hoverPercent !== null && hoverIndex !== -1 && ticks[hoverIndex] && (
                    <div
                        className="absolute right-10 bg-indigo-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xl border border-indigo-400/20 whitespace-nowrap z-50 pointer-events-none -translate-y-1/2 flex items-center"
                        style={{
                            top: `${hoverPercent}%`,
                        }}
                    >
                        <span>
                            {ticks[hoverIndex].type === 'day'
                                ? `${ticks[hoverIndex].day} ${MONTH_NAMES[ticks[hoverIndex].month]} ${ticks[hoverIndex].year}`
                                : `${MONTH_NAMES[ticks[hoverIndex].month]} ${ticks[hoverIndex].year}`}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
const TimelineView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [metadata, setMetadata] = useState(null);
    const [metadataLoading, setMetadataLoading] = useState(true);
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);
    const [directModalImage, setDirectModalImage] = useState(null);
    const [activeKey, setActiveKey] = useState(null); // "year-month"
    const [gridSize, setGridSize] = useState(
        () => localStorage.getItem('pycasa-grid-size') || 'md'
    );

    const containerRef = useRef(null);
    const colCount = useColumnCount(containerRef, gridSize);
    const imagesRef = useRef(images);
    const requestedPagesRef = useRef(new Set());

    const fetchImages = useCallback(async (pageNum) => {
        try {
            const limit = 50;
            const newImages = await api.images.list(
                null,
                null,
                null,
                'modified_at',
                'DESC',
                pageNum,
                limit
            );
            if (Array.isArray(newImages)) {
                const startIndex = (pageNum - 1) * limit;
                setImages((prev) => {
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

    // Sync grid size selection to local storage
    useEffect(() => {
        localStorage.setItem('pycasa-grid-size', gridSize);
    }, [gridSize]);

    // Keep imagesRef in sync so callbacks can read latest values
    useEffect(() => {
        imagesRef.current = images;
    }, [images]);

    // Sync route /photos/:id with modal state
    useEffect(() => {
        if (!id) {
            setSelectedImageIndex(null);
            setDirectModalImage(null);
            return;
        }

        const idx = images.findIndex((img) => img?.id === id);
        if (idx !== -1) {
            setSelectedImageIndex(idx);
            setDirectModalImage(null);
        } else {
            const handleImageMetadata = (img) => {
                setDirectModalImage(img);
                setSelectedImageIndex(null);

                if (metadata && img) {
                    const d = new Date(img.modified_at || img.modified);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}`;

                    const dates = Object.keys(metadata).sort((a, b) => b.localeCompare(a));
                    let lowerBound = 0;
                    for (const dateKey of dates) {
                        if (dateKey > dateStr) {
                            lowerBound += metadata[dateKey];
                        } else {
                            break;
                        }
                    }
                    const countOnDate = metadata[dateStr] || 0;
                    const upperBound = lowerBound + countOnDate;

                    const limit = 50;
                    const startPage = Math.floor(lowerBound / limit) + 1;
                    const endPage = Math.max(startPage, Math.floor((upperBound - 1) / limit) + 1);

                    for (let p = startPage; p <= endPage; p++) {
                        if (!requestedPagesRef.current.has(p)) {
                            requestedPagesRef.current.add(p);
                            fetchImages(p);
                        }
                    }
                }
            };

            if (directModalImage && directModalImage.id === id) {
                handleImageMetadata(directModalImage);
            } else {
                api.images
                    .getMetadata(null, id)
                    .then((img) => {
                        if (img) {
                            handleImageMetadata(img);
                        }
                    })
                    .catch((err) => console.error('Error fetching photo details for modal:', err));
            }
        }
    }, [id, images, metadata, fetchImages, directModalImage]);

    const selectedImage =
        selectedImageIndex !== null ? images[selectedImageIndex] : directModalImage;
    const setSelectedImage = useCallback(
        (img) => {
            if (!img) {
                navigate('/timeline');
                return;
            }
            navigate(`/photos/${img.id}`, { state: { background: '/timeline' } });
        },
        [navigate]
    );

    // ── Data fetching ────────────────────────────────────────────────────────

    const loadTimeline = useCallback(async () => {
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
    }, [fetchImages]);

    useEffect(() => {
        loadTimeline();
    }, [loadTimeline]);

    useEffect(() => {
        const handleUpload = () => {
            setImages([]);
            requestedPagesRef.current.clear();
            loadTimeline();
        };
        window.addEventListener('pycasa-image-uploaded', handleUpload);
        return () => window.removeEventListener('pycasa-image-uploaded', handleUpload);
    }, [loadTimeline]);

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
        sortedDates.forEach((dateStr) => {
            const count = metadata[dateStr];
            if (count <= 0) return;
            const date = new Date(dateStr + 'T00:00:00');
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();
            if (!groups[year]) groups[year] = {};
            if (!groups[year][month]) groups[year][month] = {};
            if (!groups[year][month][day]) groups[year][month][day] = [];
            for (let i = 0; i < count; i++) {
                groups[year][month][day].push({ index: globalIndex++, dateStr, year, month, day });
            }
        });
        return groups;
    }, [metadata]);

    const years = useMemo(() => Object.keys(groupedSlots).sort((a, b) => b - a), [groupedSlots]);

    /**
     * A flat ordered array of typed "row" objects that the virtualizer renders:
     *   year-header   → shows the year label (e.g., "2024")
     *   month-header  → shows "Jan 2024" — used for sidebar sync
     *   day-header    → shows "4 Jun 2024"
     *   image-row     → a single grid row of up to colCount images
     */
    const flatRows = useMemo(() => {
        const rows = [];
        years.forEach((year) => {
            rows.push({ type: 'year-header', year, key: `year-${year}` });
            const months = Object.keys(groupedSlots[year]).sort((a, b) => b - a);
            months.forEach((month) => {
                rows.push({
                    type: 'month-header',
                    year: +year,
                    month: +month,
                    key: `${year}-${month}`,
                });
                const days = Object.keys(groupedSlots[year][month]).sort((a, b) => +b - +a);
                days.forEach((day) => {
                    rows.push({
                        type: 'day-header',
                        year: +year,
                        month: +month,
                        day: +day,
                        key: `${year}-${month}-${day}`,
                    });
                    const slots = groupedSlots[year][month][day];
                    for (let i = 0; i < slots.length; i += colCount) {
                        rows.push({
                            type: 'image-row',
                            year: +year,
                            month: +month,
                            day: +day,
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
            const rHeight = gridSize === 'sm' ? 120 : gridSize === 'lg' ? 240 : 180;
            switch (row.type) {
                case 'year-header':
                    return 0;
                case 'month-header':
                    return 0;
                case 'day-header':
                    return 44;
                case 'image-row':
                    return rHeight;
                default:
                    return 200;
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
                if (
                    (row?.type === 'month-header' || row?.type === 'day-header') &&
                    item.start <= scrollTop + 80
                ) {
                    newActive =
                        row.type === 'day-header'
                            ? `${row.year}-${row.month}-${row.day}`
                            : `${row.year}-${row.month}`;
                }
            }
            if (!newActive) {
                for (let i = (virtualItems[0]?.index ?? 0) - 1; i >= 0; i--) {
                    const row = flatRows[i];
                    if (row?.type === 'month-header' || row?.type === 'day-header') {
                        newActive =
                            row.type === 'day-header'
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
            virtualItems.forEach((item) => {
                const row = flatRows[item.index];
                if (row?.type === 'image-row') {
                    row.slots.forEach((slot) => {
                        if (!imagesRef.current[slot.index]) {
                            const pageNum = Math.floor(slot.index / limit) + 1;
                            pagesToLoad.add(pageNum);
                        }
                    });
                }
            });

            pagesToLoad.forEach((pageNum) => {
                if (!requestedPagesRef.current.has(pageNum)) {
                    requestedPagesRef.current.add(pageNum);
                    fetchImages(pageNum);
                }
            });
        },
    });

    // ── Navigation ───────────────────────────────────────────────────────────

    const handleNavigateToMonth = useCallback(
        (monthKey, smooth = true) => {
            const index = monthKeyToIndex[monthKey];
            if (index !== undefined) {
                rowVirtualizer.scrollToIndex(index, {
                    align: 'start',
                    behavior: smooth ? 'smooth' : 'auto',
                });
            }
        },
        [monthKeyToIndex, rowVirtualizer]
    );

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
        return {
            ...selectedImage,
            full_path: selectedImage.file_path,
            modified: selectedImage.modified_at,
            size: selectedImage.file_size,
        };
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
    const totalSize = rowVirtualizer.getTotalSize();

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
                        {virtualItems.map((virtualItem) => {
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
                                    {/* Year header - hidden visually */}
                                    {row.type === 'year-header' && null}

                                    {/* Month header - hidden visually */}
                                    {row.type === 'month-header' && null}

                                    {/* Image grid row */}
                                    {row.type === 'image-row' &&
                                        (() => {
                                            const rHeight =
                                                gridSize === 'sm'
                                                    ? 120
                                                    : gridSize === 'lg'
                                                      ? 240
                                                      : 180;
                                            return (
                                                <div className="px-8 pb-1">
                                                    <div className="flex gap-1 flex-row w-full justify-start items-stretch">
                                                        {row.slots.map((slot) => {
                                                            const image = images[slot.index];
                                                            return image ? (
                                                                <ImageCard
                                                                    key={
                                                                        image.id || image.file_path
                                                                    }
                                                                    rowHeight={rHeight}
                                                                    image={{
                                                                        ...image,
                                                                        full_path: image.file_path,
                                                                        modified: image.modified_at,
                                                                        size: image.file_size,
                                                                    }}
                                                                    isSelected={
                                                                        selectedImage?.id ===
                                                                        image.id
                                                                    }
                                                                    onSelect={(img) =>
                                                                        setSelectedImage(img)
                                                                    }
                                                                />
                                                            ) : (
                                                                <PlaceholderCard
                                                                    key={`ph-${slot.index}`}
                                                                    rowHeight={rHeight}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                    {/* Day header */}
                                    {row.type === 'day-header' &&
                                        (() => {
                                            const date = new Date(row.year, row.month, row.day);
                                            const daysOfWeek = [
                                                'Sun',
                                                'Mon',
                                                'Tue',
                                                'Wed',
                                                'Thu',
                                                'Fri',
                                                'Sat',
                                            ];
                                            const dateStr = `${daysOfWeek[date.getDay()]}, ${row.day} ${MONTH_NAMES[row.month]} ${row.year}`;
                                            return (
                                                <div className="px-8 pt-4 pb-1.5 select-none">
                                                    <h3 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 font-sans tracking-wide">
                                                        {dateStr}
                                                    </h3>
                                                </div>
                                            );
                                        })()}
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

            {/* ── Dynamic Grid Size Selector floating pill (Google Photos zoom style) ── */}
            <div className="absolute bottom-5 right-28 flex items-center bg-white/90 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-800/80 rounded-full shadow-lg p-1.5 z-20 space-x-1.5 backdrop-blur-md select-none scale-90 sm:scale-100">
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

            {/* ── Right sidebar — M3 Timeline Slider ──────────────────────── */}
            <div
                className="absolute right-2 top-0 bottom-0 flex items-stretch bg-transparent pointer-events-none select-none"
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
                isOpen={!!id}
                onClose={() => navigate('/timeline')}
                onUpdate={() => {
                    if (selectedImageIndex !== null) {
                        const pageNum = Math.floor(selectedImageIndex / 50) + 1;
                        fetchImages(pageNum);
                    }
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
        </div>
    );
};

export default TimelineView;
