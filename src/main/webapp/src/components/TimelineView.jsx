import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/lib/api';
import ImageCard from './ImageCard';
import ImageDetailModal from './ImageDetailModal';
import {
    Calendar,
    Loader2,
    ArrowLeft,
    SlidersHorizontal,
    Folder,
    Tag,
    Heart,
    Edit2,
} from 'lucide-react';

const KNOWN_EXTENSIONS = [
    { group: 'JPEG', exts: ['jpg', 'jpeg'] },
    { group: 'PNG', exts: ['png'] },
    { group: 'GIF', exts: ['gif'] },
    { group: 'WebP', exts: ['webp'] },
    { group: 'HEIC', exts: ['heic', 'heif'] },
    { group: 'RAW', exts: ['raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2'] },
];

const SIZE_PRESETS = [
    { label: 'Any size', min: null, max: null },
    { label: '< 500 KB', min: null, max: 500_000 },
    { label: '500 KB – 2 MB', min: 500_000, max: 2_000_000 },
    { label: '2 MB – 10 MB', min: 2_000_000, max: 10_000_000 },
    { label: '> 10 MB', min: 10_000_000, max: null },
];

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

/** Returns the responsive column count and container width based on the container element's width. */
function useContainerDimensions(containerRef, gridSize = 'md', metadataLoading = false) {
    const [dimensions, setDimensions] = useState({ cols: 4, width: 0 });
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
            const w = entries[0].contentRect.width;
            setDimensions({ cols: compute(w), width: w });
        });
        obs.observe(el);
        const rect = el.getBoundingClientRect();
        setDimensions({ cols: compute(rect.width), width: rect.width });
        return () => obs.disconnect();
    }, [containerRef, gridSize, metadataLoading]);
    return dimensions;
}

/* ── M3-style vertical timeline slider ──────────────────────────────────── */

const TimelineSlider = ({ groupedSlots, years, activeKey, onNavigate }) => {
    const containerRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [hoverY, setHoverY] = useState(null);
    const [isHovering, setIsHovering] = useState(false);

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

    const handleDrag = useCallback(
        (e) => {
            if (!containerRef.current || !ticks.length) return;
            const rect = containerRef.current.getBoundingClientRect();
            const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
            const percent = y / rect.height;
            const index = Math.max(
                0,
                Math.min(ticks.length - 1, Math.round(percent * (ticks.length - 1)))
            );

            const tick = ticks[index];
            if (tick) {
                onNavigate(tick.key, false); // instant scroll
            }
        },
        [ticks, onNavigate]
    );

    const handleMouseDown = useCallback(
        (e) => {
            e.preventDefault();
            setIsDragging(true);
            handleDrag(e);
        },
        [handleDrag]
    );

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            handleDrag(e);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleDrag]);

    const handleMouseMoveTrack = useCallback((e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setHoverY(y);
    }, []);

    const handleMouseEnterTrack = useCallback(() => {
        setIsHovering(true);
    }, []);

    const handleMouseLeaveTrack = useCallback(() => {
        setIsHovering(false);
    }, []);

    if (!ticks.length) return null;

    const hoverIndex = (() => {
        if (hoverY === null || !containerRef.current || !ticks.length) return -1;
        const rect = containerRef.current.getBoundingClientRect();
        const percent = hoverY / rect.height;
        return Math.max(0, Math.min(ticks.length - 1, Math.round(percent * (ticks.length - 1))));
    })();

    const hoveredTick = ticks[hoverIndex];
    const activeTick = ticks[activeIndex];

    const activePercent = ticks.length > 1 ? (activeIndex / (ticks.length - 1)) * 100 : 0;
    const hoverPercent =
        hoverY && containerRef.current
            ? (hoverY / containerRef.current.getBoundingClientRect().height) * 100
            : 0;

    return (
        <div
            ref={containerRef}
            className="relative w-24 h-full flex flex-col justify-between py-10 select-none pointer-events-auto cursor-ns-resize group/scrubber"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMoveTrack}
            onMouseEnter={handleMouseEnterTrack}
            onMouseLeave={handleMouseLeaveTrack}
        >
            {/* Clean vertical track line */}
            <div className="absolute right-4 top-10 bottom-10 w-[2px] bg-slate-300/30 dark:bg-slate-700/30 rounded-full transition-all duration-200 group-hover/scrubber:bg-slate-400/50 dark:group-hover/scrubber:bg-slate-600/50" />

            {/* Year Labels and Month ticks */}
            <div className="absolute right-0 top-10 bottom-10 left-0 pointer-events-none">
                {ticks.map((tick, idx) => {
                    const isActive = idx === activeIndex;
                    const percent = ticks.length > 1 ? (idx / (ticks.length - 1)) * 100 : 0;

                    // Draw subtle tick marks for months/days when hovering
                    if (!tick.isFirstOfYear) {
                        if (tick.type === 'month') {
                            return (
                                <div
                                    key={tick.key}
                                    className={`absolute right-4 -translate-y-1/2 w-1.5 h-[1px] bg-slate-400 dark:bg-slate-600 transition-all duration-200 ${
                                        isHovering || isDragging ? 'opacity-60' : 'opacity-0'
                                    }`}
                                    style={{ top: `${percent}%` }}
                                />
                            );
                        }
                        return null; // hide day ticks to keep it clean
                    }

                    // Render Year Label
                    return (
                        <div
                            key={tick.key}
                            className="absolute right-7 -translate-y-1/2 flex items-center transition-all duration-200"
                            style={{ top: `${percent}%` }}
                        >
                            <span
                                className={`text-[11px] font-extrabold tracking-wider font-sans transition-all ${
                                    isActive
                                        ? 'text-indigo-500 dark:text-indigo-400 scale-110'
                                        : 'text-slate-400 dark:text-slate-600 group-hover/scrubber:text-slate-500 dark:group-hover/scrubber:text-slate-400'
                                }`}
                            >
                                {tick.year}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Floating Indicator and Date Badge */}
            {(isHovering || isDragging || activeIndex !== -1) && (
                <div
                    className="absolute right-4 -translate-y-1/2 flex items-center pointer-events-none z-50 transition-all duration-75"
                    style={{
                        top: `${isHovering || isDragging ? hoverPercent : activePercent}%`,
                    }}
                >
                    {/* Floating Date Badge (matches Google Photos aesthetic) */}
                    {(isHovering || isDragging || activeIndex !== -1) && (
                        <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xl border border-white/10 dark:border-slate-850/80 whitespace-nowrap mr-3 backdrop-blur-md flex items-center animate-in fade-in zoom-in-95 duration-100">
                            <span>
                                {isHovering || isDragging
                                    ? hoveredTick?.type === 'day'
                                        ? `${hoveredTick.day} ${MONTH_NAMES[hoveredTick.month]} ${hoveredTick.year}`
                                        : `${MONTH_NAMES[hoveredTick.month]} ${hoveredTick.year}`
                                    : activeTick?.type === 'day'
                                      ? `${activeTick.day} ${MONTH_NAMES[activeTick.month]} ${activeTick.year}`
                                      : activeTick
                                        ? `${MONTH_NAMES[activeTick.month]} ${activeTick.year}`
                                        : ''}
                            </span>
                        </div>
                    )}

                    {/* Underline pointer indicator */}
                    <div className="w-12 h-[2px] bg-indigo-500 dark:bg-indigo-450 rounded-full" />
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
const TimelineView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Parse URL query parameters reactively
    const queryParams = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return {
            search: params.get('q') || '',
            folderId: params.get('folder') || 'all',
            tags: params.get('tags') ? params.get('tags').split(',') : [],
            dateFrom: params.get('date_from') || '',
            dateTo: params.get('date_to') || '',
            types: params.get('types') ? params.get('types').split(',') : [],
            sizePresetIdx: params.get('size') ? parseInt(params.get('size'), 10) : 0,
            aiOnly: params.get('ai') === 'true',
            aiFailed: params.get('ai_failed') === 'true',
            faceFailed: params.get('face_failed') === 'true',
            personName: params.get('person') || '',
            faceId: params.get('face_id') || '',
        };
    }, [location.search]);

    const [metadata, setMetadata] = useState(null);
    const [metadataLoading, setMetadataLoading] = useState(true);
    const [personFaceId, setPersonFaceId] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);
    const [directModalImage, setDirectModalImage] = useState(null);
    const [activeKey, setActiveKey] = useState(null); // "year-month"
    const [gridSize, setGridSize] = useState(
        () => localStorage.getItem('pycasa-grid-size') || 'md'
    );

    const containerRef = useRef(null);
    const { cols: colCount, width: containerWidth } = useContainerDimensions(
        containerRef,
        gridSize,
        metadataLoading
    );
    const imagesRef = useRef(images);
    const requestedPagesRef = useRef(new Set());

    const fetchImages = useCallback(
        async (pageNum) => {
            try {
                const limit = 50;
                const fId = queryParams.folderId === 'all' ? null : queryParams.folderId;
                const dateFromMs = queryParams.dateFrom
                    ? new Date(queryParams.dateFrom).setHours(0, 0, 0, 0)
                    : null;
                const dateToMs = queryParams.dateTo
                    ? new Date(queryParams.dateTo).setHours(23, 59, 59, 999)
                    : null;
                const extensions =
                    queryParams.types.length > 0
                        ? queryParams.types.flatMap(
                              (g) => KNOWN_EXTENSIONS.find((k) => k.group === g)?.exts ?? []
                          )
                        : null;
                const { min: sizeMin, max: sizeMax } = SIZE_PRESETS[queryParams.sizePresetIdx];

                const newImages = await api.images.list(
                    fId,
                    queryParams.search || null,
                    queryParams.tags.length > 0 ? queryParams.tags : null,
                    'modified_at',
                    'DESC',
                    pageNum,
                    limit,
                    dateFromMs,
                    dateToMs,
                    extensions,
                    sizeMin,
                    sizeMax,
                    null, // favorite
                    false, // trashed
                    null, // albumId
                    queryParams.aiOnly ? true : null,
                    queryParams.aiFailed ? true : null,
                    null, // faceAnalysed
                    queryParams.faceFailed ? true : null,
                    queryParams.personName || null,
                    queryParams.faceId || null
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
        },
        [queryParams]
    );

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
                const backUrl = location.state?.background || '/timeline';
                navigate(backUrl);
                return;
            }
            const bg = location.state?.background || location.pathname + location.search;
            navigate(`/photos/${img.id}`, { state: { background: bg } });
        },
        [navigate, location]
    );

    // ── Data fetching ────────────────────────────────────────────────────────

    const loadTimeline = useCallback(async () => {
        setMetadataLoading(true);
        try {
            // Reset images and pages when timeline is reloaded (filters changed)
            setImages([]);
            requestedPagesRef.current.clear();

            const fId = queryParams.folderId === 'all' ? null : queryParams.folderId;
            const dateFromMs = queryParams.dateFrom
                ? new Date(queryParams.dateFrom).setHours(0, 0, 0, 0)
                : null;
            const dateToMs = queryParams.dateTo
                ? new Date(queryParams.dateTo).setHours(23, 59, 59, 999)
                : null;
            const extensions =
                queryParams.types.length > 0
                    ? queryParams.types.flatMap(
                          (g) => KNOWN_EXTENSIONS.find((k) => k.group === g)?.exts ?? []
                      )
                    : null;
            const { min: sizeMin, max: sizeMax } = SIZE_PRESETS[queryParams.sizePresetIdx];

            const meta = await api.images.getMetadata(null, null, {
                folder_id: fId,
                search: queryParams.search || null,
                tags: queryParams.tags.length > 0 ? queryParams.tags.join(',') : null,
                date_from: dateFromMs,
                date_to: dateToMs,
                extensions: extensions ? extensions.join(',') : null,
                size_min: sizeMin,
                size_max: sizeMax,
                ai_analysed: queryParams.aiOnly ? true : null,
                ai_failed: queryParams.aiFailed ? true : null,
                face_failed: queryParams.faceFailed ? true : null,
                person: queryParams.personName || null,
                face_id: queryParams.faceId || null,
            });
            setMetadata(meta);
            setMetadataLoading(false);
            requestedPagesRef.current.add(1);
            await fetchImages(1);
        } catch (error) {
            console.error('Failed to load timeline:', error);
        } finally {
            setMetadataLoading(false);
        }
    }, [fetchImages, queryParams]);

    const handleSaveName = async () => {
        const trimmed = editNameValue.trim();
        setIsEditingName(false);
        if (!trimmed || trimmed === queryParams.personName) return;

        if (faceIdToShow) {
            try {
                await api.face.updateFaceName(faceIdToShow, trimmed);
                navigate(`/timeline?person=${encodeURIComponent(trimmed)}`);
            } catch (err) {
                console.error('Failed to rename person:', err);
            }
        }
    };

    useEffect(() => {
        loadTimeline();
    }, [loadTimeline]);

    useEffect(() => {
        if (queryParams.personName) {
            api.face
                .listFaces()
                .then((faces) => {
                    const match = faces.find(
                        (f) =>
                            f.name && f.name.toLowerCase() === queryParams.personName.toLowerCase()
                    );
                    if (match) {
                        setPersonFaceId(match.id);
                    }
                })
                .catch(() => {});
        } else {
            setPersonFaceId(null);
        }
    }, [queryParams.personName]);

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
                    const targetAspect = colCount * 1.35; // target sum of aspect ratios for one row

                    let currentRow = [];
                    let currentAspect = 0;
                    let rowIndex = 0;

                    slots.forEach((slot) => {
                        const img = images[slot.index];
                        const aspect =
                            img && img.width && img.height ? img.width / img.height : 1.4;

                        currentRow.push(slot);
                        currentAspect += aspect;

                        // If we reached or exceeded the target aspect ratio, complete the row
                        if (currentAspect >= targetAspect) {
                            rows.push({
                                type: 'image-row',
                                year: +year,
                                month: +month,
                                day: +day,
                                slots: currentRow,
                                key: `${year}-${month}-${day}-r${rowIndex}`,
                                isLastRow: false,
                            });
                            currentRow = [];
                            currentAspect = 0;
                            rowIndex++;
                        }
                    });

                    // Push any remaining images in the last row of the day
                    if (currentRow.length > 0) {
                        rows.push({
                            type: 'image-row',
                            year: +year,
                            month: +month,
                            day: +day,
                            slots: currentRow,
                            key: `${year}-${month}-${day}-r${rowIndex}`,
                            isLastRow: true,
                        });
                    }
                });
            });
        });
        return rows;
    }, [groupedSlots, years, colCount, images]);

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
    const faceIdToShow = queryParams.faceId || personFaceId;

    return (
        <div className="relative flex flex-col flex-grow h-[calc(100vh-4rem)] bg-white dark:bg-slate-950 overflow-hidden">
            {/* Header for Filtered Views (AI Failed / AI Only) */}
            {(queryParams.aiFailed ||
                queryParams.aiOnly ||
                queryParams.faceFailed ||
                queryParams.personName ||
                queryParams.faceId) && (
                <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200 dark:border-white/[0.06] shrink-0 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/timeline')}
                            className="p-1.5 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-full transition-colors"
                            title="Back to all photos"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-2.5">
                            {faceIdToShow && (
                                <img
                                    src={api.face.getFaceThumbnailUrl(faceIdToShow)}
                                    alt="Face"
                                    className="w-[72px] h-[72px] rounded-full object-cover border-2 border-slate-200 dark:border-white/15 shadow-md shrink-0"
                                />
                            )}
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    {queryParams.personName ? (
                                        isEditingName ? (
                                            <input
                                                type="text"
                                                value={editNameValue}
                                                onChange={(e) => setEditNameValue(e.target.value)}
                                                onBlur={handleSaveName}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleSaveName();
                                                    }
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setIsEditingName(false);
                                                    }
                                                }}
                                                className="text-sm font-extrabold bg-slate-150 dark:bg-zinc-900 border border-indigo-500 rounded px-2 py-0.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                autoFocus
                                            />
                                        ) : (
                                            <span
                                                onClick={() => {
                                                    setIsEditingName(true);
                                                    setEditNameValue(queryParams.personName);
                                                }}
                                                className="text-sm font-extrabold text-slate-800 dark:text-white/90 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1.5 group/title"
                                                title="Click to rename"
                                            >
                                                {queryParams.personName}
                                                <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover/title:opacity-100 transition-opacity text-slate-400" />
                                            </span>
                                        )
                                    ) : (
                                        <span className="text-sm font-extrabold text-slate-800 dark:text-white/90">
                                            {queryParams.aiFailed
                                                ? 'AI Analysis Failed Files'
                                                : queryParams.faceFailed
                                                  ? 'Face Detection Failed Images'
                                                  : queryParams.faceId
                                                    ? 'Selected Face'
                                                    : 'AI Analysed Photos'}
                                        </span>
                                    )}
                                    <span className="text-xs font-bold text-slate-450 dark:text-white/30 self-end mb-[2px]">
                                        {totalImageCount} {totalImageCount === 1 ? 'file' : 'files'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="relative flex flex-1 overflow-hidden">
                {/* ── Scrollable timeline area ─────────────────────────────────── */}
                <div
                    ref={containerRef}
                    className="flex-grow overflow-y-auto no-scrollbar"
                    style={{ paddingRight: '3.5rem' /* make room for the fixed 96px sidebar */ }}
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
                                                let rHeight =
                                                    gridSize === 'sm'
                                                        ? 120
                                                        : gridSize === 'lg'
                                                          ? 240
                                                          : 180;

                                                if (!row.isLastRow && containerWidth > 0) {
                                                    const sumAspect = row.slots.reduce(
                                                        (sum, slot) => {
                                                            const img = images[slot.index];
                                                            const aspect =
                                                                img && img.width && img.height
                                                                    ? img.width / img.height
                                                                    : 1.4;
                                                            return sum + aspect;
                                                        },
                                                        0
                                                    );
                                                    if (sumAspect > 0) {
                                                        const gapWidth = (row.slots.length - 1) * 4; // gap-1 is 4px
                                                        const calculatedHeight =
                                                            (containerWidth - 64 - gapWidth) /
                                                            sumAspect;
                                                        // Clamp height to prevent extreme scaling
                                                        const minH =
                                                            gridSize === 'sm'
                                                                ? 80
                                                                : gridSize === 'lg'
                                                                  ? 160
                                                                  : 120;
                                                        const maxH =
                                                            gridSize === 'sm'
                                                                ? 240
                                                                : gridSize === 'lg'
                                                                  ? 480
                                                                  : 360;
                                                        rHeight = Math.max(
                                                            minH,
                                                            Math.min(maxH, calculatedHeight)
                                                        );
                                                    }
                                                }
                                                return (
                                                    <div className="px-8 pb-1">
                                                        <div className="flex gap-1 flex-row w-full justify-start items-stretch">
                                                            {row.slots.map((slot) => {
                                                                const image = images[slot.index];
                                                                return image ? (
                                                                    <ImageCard
                                                                        key={
                                                                            image.id ||
                                                                            image.file_path
                                                                        }
                                                                        rowHeight={rHeight}
                                                                        image={{
                                                                            ...image,
                                                                            full_path:
                                                                                image.file_path,
                                                                            modified:
                                                                                image.modified_at,
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
                                                            {row.isLastRow && (
                                                                <div
                                                                    className="flex-grow-[100000] shrink"
                                                                    style={{
                                                                        flexBasis: '0px',
                                                                        height: '0px',
                                                                    }}
                                                                />
                                                            )}
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
                    onClose={() => {
                        const bg = location.state?.background || '/timeline';
                        navigate(bg);
                    }}
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
        </div>
    );
};

export default TimelineView;
