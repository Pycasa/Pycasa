import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Map, Overlay } from 'pigeon-maps';
import { api } from '@/lib/api';
import { MapPin, X, Loader2, Image as ImageIcon, Calendar, FolderClosed, Plus } from 'lucide-react';
import ImageDetailModal from './ImageDetailModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';

// ─── Geo Clustering ───────────────────────────────────────────────────────────
function clusterPoints(points, zoom, pixelRadius = 50) {
    const worldSize = 256 * Math.pow(2, zoom);
    const cellSize = pixelRadius;

    function latLngToPixel(lat, lng) {
        const x = ((lng + 180) / 360) * worldSize;
        const sinLat = Math.sin((lat * Math.PI) / 180);
        const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
        return { x, y };
    }

    const cells = {};
    for (const pt of points) {
        const px = latLngToPixel(pt.lat, pt.lng);
        const cellX = Math.floor(px.x / cellSize);
        const cellY = Math.floor(px.y / cellSize);
        const key = `${cellX}:${cellY}`;
        if (!cells[key]) cells[key] = [];
        cells[key].push(pt);
    }

    return Object.values(cells).map((group) => {
        // Sort group desc by date_taken already for later use
        const sorted = [...group].sort((a, b) => {
            const da = a.date_taken ? new Date(a.date_taken).getTime() : a.date_taken || 0;
            const db = b.date_taken ? new Date(b.date_taken).getTime() : b.date_taken || 0;
            return db - da;
        });
        const avgLat = sorted.reduce((s, p) => s + p.lat, 0) / sorted.length;
        const avgLng = sorted.reduce((s, p) => s + p.lng, 0) / sorted.length;
        const cover = sorted[0];
        return {
            id: cover.id,
            lat: avgLat,
            lng: avgLng,
            count: sorted.length,
            points: sorted, // already sorted desc by date
            cover,
            isCluster: sorted.length > 1,
            locationName: sorted.find((p) => p.location_name)?.location_name || null,
        };
    });
}

const mapProviders = {
    dark: (x, y, z) => {
        const s = ['a', 'b', 'c'][Math.abs(x + y) % 3];
        return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
    },
    roadmap: (x, y, z) => `https://mt1.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`,
    hybrid: (x, y, z) => `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`,
    terrain: (x, y, z) => `https://mt1.google.com/vt/lyrs=t&x=${x}&y=${y}&z=${z}`,
};

function formatDate(ts) {
    if (!ts) return null;
    try {
        return new Date(typeof ts === 'number' ? ts : ts).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        });
    } catch {
        return null;
    }
}

// ─── Main Component ────────────────────────────────────────────────────────────
const PlacesView = () => {
    const [points, setPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [zoom, setZoom] = useState(3);
    const [center, setCenter] = useState([20, 0]);
    const [selectedCluster, setSelectedCluster] = useState(null); // cluster whose images to show
    const [selectedImage, setSelectedImage] = useState(null); // image open in detail modal
    const [hoveredCluster, setHoveredCluster] = useState(null);
    const [mapStyle, setMapStyle] = useState(() => {
        return localStorage.getItem('pycasa-map-style') || 'hybrid';
    });

    const handleMapStyleChange = (style) => {
        setMapStyle(style);
        localStorage.setItem('pycasa-map-style', style);
    };

    // Track last zoom applied to avoid double-firing from controlled re-render
    const lastZoomRef = React.useRef(3);
    const lastCenterRef = React.useRef([20, 0]);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const data = await api.images.listGeolocated(5000);
                setPoints(data || []);
                if (data && data.length > 0) {
                    const avgLat = data.reduce((s, p) => s + p.lat, 0) / data.length;
                    const avgLng = data.reduce((s, p) => s + p.lng, 0) / data.length;
                    const initZoom = data.length === 1 ? 12 : 3;
                    lastZoomRef.current = initZoom;
                    lastCenterRef.current = [avgLat, avgLng];
                    setCenter([avgLat, avgLng]);
                    setZoom(initZoom);
                }
            } catch {
                /* silently ignore */
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const clusters = useMemo(() => {
        if (!points.length) return [];
        return clusterPoints(points, zoom);
    }, [points, zoom]);

    const handleBoundsChanged = useCallback(({ center: c, zoom: z }) => {
        const roundedZ = Math.round(z);
        // Only update state if values actually changed — prevents the controlled-prop
        // feedback loop that caused every zoom/pan to fire twice
        if (roundedZ !== lastZoomRef.current) {
            lastZoomRef.current = roundedZ;
            setZoom(roundedZ);
        }
        if (
            Math.abs(c[0] - lastCenterRef.current[0]) > 0.0001 ||
            Math.abs(c[1] - lastCenterRef.current[1]) > 0.0001
        ) {
            lastCenterRef.current = c;
            setCenter(c);
        }
    }, []);

    const handleClusterClick = useCallback((cluster) => {
        // Always show the photo panel for any cluster or single point
        setSelectedCluster(cluster);
        // Also pan map to the cluster center
        const newCenter = [cluster.lat, cluster.lng];
        lastCenterRef.current = newCenter;
        setCenter(newCenter);
    }, []);

    const thumbnailUrl = useCallback((img) => api.images.getThumbnail(img.file_path), []);

    // Open full detail modal for a photo — normalise shape for ImageDetailModal
    const normalisePhoto = useCallback(
        (img) => ({
            ...img,
            full_path: img.file_path || img.full_path,
            modified: img.modified_at,
            size: img.file_size,
        }),
        []
    );

    const openImage = useCallback(
        (img) => {
            setSelectedImage(normalisePhoto(img));
        },
        [normalisePhoto]
    );

    const closeModal = useCallback(() => {
        setSelectedImage(null);
    }, []);

    // Navigate within the current cluster's photo list
    const clusterPhotos = selectedCluster?.points ?? [];
    const selectedIdx = selectedImage
        ? clusterPhotos.findIndex((p) => p.id === selectedImage.id)
        : -1;

    const goNext = useCallback(() => {
        if (selectedIdx < clusterPhotos.length - 1) {
            setSelectedImage(normalisePhoto(clusterPhotos[selectedIdx + 1]));
        }
    }, [selectedIdx, clusterPhotos, normalisePhoto]);

    const goPrev = useCallback(() => {
        if (selectedIdx > 0) {
            setSelectedImage(normalisePhoto(clusterPhotos[selectedIdx - 1]));
        }
    }, [selectedIdx, clusterPhotos, normalisePhoto]);

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 bg-[#0e1117]">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                <div className="text-center">
                    <p className="text-white/80 font-medium">Loading your photo map…</p>
                    <p className="text-white/40 text-sm mt-1">Fetching GPS coordinates</p>
                </div>
            </div>
        );
    }

    if (points.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-5 bg-[#0e1117] text-center p-8">
                <div className="w-20 h-20 rounded-3xl bg-indigo-900/20 border border-indigo-900/40 flex items-center justify-center">
                    <MapPin className="w-10 h-10 text-indigo-400" />
                </div>
                <div>
                    <p className="text-white/80 font-semibold text-xl">No location data yet</p>
                    <p className="text-white/40 text-sm mt-2 max-w-sm leading-relaxed">
                        Photos with GPS coordinates will appear here on an interactive map — just
                        like Google Photos.
                    </p>
                </div>
                <div className="text-left bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/50 max-w-sm">
                    <p className="text-white/70 font-medium mb-2">💡 Tips to get location data:</p>
                    <p>• Enable GPS on your camera or phone</p>
                    <p>• Use geo-tagging software for DSLR photos</p>
                    <p>• Re-scan your folders after enabling GPS</p>
                </div>
            </div>
        );
    }

    const panelOpen = !!selectedCluster;

    return (
        <div className="h-full w-full flex overflow-hidden bg-[#0e1117]">
            {/* ── Map pane ── */}
            <div
                className="relative h-full flex-shrink-0 transition-all duration-500 ease-in-out"
                style={{ width: panelOpen ? '42%' : '100%' }}
            >
                {/* Header overlay */}
                <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
                    <div className="flex items-center justify-between px-4 py-3 gap-2 flex-wrap">
                        <div className="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-3 py-1.5 shadow-xl">
                            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-white/90 text-xs font-semibold">Places</span>
                            <span className="text-white/30 text-xs">·</span>
                            <span className="text-white/50 text-xs">
                                {points.length} photo{points.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        {/* Map Style Selector */}
                        <div className="pointer-events-auto flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-1 shadow-xl">
                            {[
                                { id: 'hybrid', label: 'Satellite' },
                                { id: 'roadmap', label: 'Google Maps' },
                                { id: 'dark', label: 'Dark Mode' },
                            ].map((style) => (
                                <button
                                    key={style.id}
                                    onClick={() => handleMapStyleChange(style.id)}
                                    className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all ${
                                        mapStyle === style.id
                                            ? 'bg-indigo-500 text-white shadow-sm'
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {style.label}
                                </button>
                            ))}
                        </div>

                        <div className="pointer-events-auto flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-2.5 py-1 shadow-xl">
                            <span className="text-white/40 text-[10px] font-medium uppercase tracking-wider">
                                Z
                            </span>
                            <span className="text-white/80 text-xs font-bold tabular-nums">
                                {zoom}
                            </span>
                        </div>
                    </div>
                </div>

                <Map
                    center={center}
                    zoom={zoom}
                    onBoundsChanged={handleBoundsChanged}
                    provider={mapProviders[mapStyle]}
                    attribution={
                        <span className="text-[10px] text-white/30">
                            {mapStyle === 'dark' ? (
                                <>
                                    ©{' '}
                                    <a
                                        href="https://carto.com"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-white/40 hover:text-white/60"
                                    >
                                        CartoDB
                                    </a>{' '}
                                    ©{' '}
                                    <a
                                        href="https://openstreetmap.org"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-white/40 hover:text-white/60"
                                    >
                                        OSM
                                    </a>
                                </>
                            ) : (
                                <span className="text-white/40">© Google Maps</span>
                            )}
                        </span>
                    }
                    style={{ height: '100%', width: '100%' }}
                >
                    {clusters.map((cluster) => (
                        <Overlay
                            key={`${cluster.id}-${cluster.count}-${zoom}`}
                            anchor={[cluster.lat, cluster.lng]}
                            offset={cluster.isCluster ? [28, 28] : [22, 22]}
                        >
                            <ClusterMarker
                                cluster={cluster}
                                thumbnailUrl={thumbnailUrl}
                                onClick={() => handleClusterClick(cluster)}
                                onHover={setHoveredCluster}
                                isHovered={hoveredCluster?.id === cluster.id}
                                isSelected={selectedCluster?.id === cluster.id}
                            />
                        </Overlay>
                    ))}
                </Map>

                {!panelOpen && clusters.length > 0 && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2 shadow-2xl">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                            <span className="text-white/60 text-xs font-medium">
                                {clusters.length} place{clusters.length !== 1 ? 's' : ''} · click to
                                explore
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Photo panel ── */}
            {panelOpen && (
                <ClusterPhotoPanel
                    cluster={selectedCluster}
                    thumbnailUrl={thumbnailUrl}
                    onClose={() => setSelectedCluster(null)}
                    onImageClick={openImage}
                />
            )}

            {/* ── Full detail modal ── */}
            {selectedImage && (
                <ImageDetailModal
                    image={selectedImage}
                    isOpen={true}
                    onClose={closeModal}
                    onNext={goNext}
                    onPrevious={goPrev}
                    hasNext={selectedIdx < clusterPhotos.length - 1}
                    hasPrevious={selectedIdx > 0}
                />
            )}
        </div>
    );
};

// ─── Cluster Marker ───────────────────────────────────────────────────────────
const ClusterMarker = ({ cluster, thumbnailUrl, onClick, onHover, isHovered, isSelected }) => {
    const size = cluster.isCluster ? Math.min(72, 44 + Math.log2(cluster.count) * 6) : 44;

    if (cluster.isCluster) {
        return (
            <button
                onClick={onClick}
                onMouseEnter={() => onHover(cluster)}
                onMouseLeave={() => onHover(null)}
                className="group relative flex items-center justify-center focus:outline-none cursor-pointer"
                style={{ width: size, height: size }}
                title={`${cluster.count} photos`}
            >
                <div
                    className={`absolute inset-0 rounded-full border-2 transition-all duration-200 ${
                        isSelected
                            ? 'border-white scale-110'
                            : 'border-indigo-400/60 group-hover:border-indigo-300 group-hover:scale-110'
                    }`}
                    style={{
                        background: isSelected
                            ? 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(99,102,241,0.2) 100%)'
                            : 'radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(99,102,241,0.12) 100%)',
                        backdropFilter: 'blur(4px)',
                    }}
                />
                <div
                    className="absolute rounded-full overflow-hidden border border-white/20"
                    style={{ inset: 7, background: '#1a1a2e' }}
                >
                    <img
                        src={thumbnailUrl(cluster.cover)}
                        alt=""
                        className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                        onError={(e) => {
                            e.target.style.display = 'none';
                        }}
                    />
                </div>
                <div
                    className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full border border-black/60 flex items-center justify-center text-white text-[10px] font-bold leading-none shadow-lg ${isSelected ? 'bg-white text-slate-900' : 'bg-indigo-500'}`}
                >
                    {cluster.count > 999 ? '999+' : cluster.count}
                </div>
                {isHovered && !isSelected && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none z-50">
                        {cluster.count} photos
                    </div>
                )}
            </button>
        );
    }

    // Single photo marker
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => onHover(cluster)}
            onMouseLeave={() => onHover(null)}
            className="group relative flex items-center justify-center focus:outline-none cursor-pointer"
            style={{ width: size, height: size }}
            title={cluster.cover.location_name || 'View photo'}
        >
            <div
                className={`absolute inset-0 rounded-full overflow-hidden border-2 transition-all duration-200 shadow-lg shadow-black/50 ${
                    isSelected
                        ? 'border-white scale-110'
                        : 'border-white/40 group-hover:border-indigo-400 group-hover:scale-110'
                }`}
                style={{ background: '#1a1a2e' }}
            >
                <img
                    src={thumbnailUrl(cluster.cover)}
                    alt=""
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                    onError={(e) => {
                        e.target.style.display = 'none';
                    }}
                />
            </div>
            <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-white/30" />
            {isHovered && cluster.cover.location_name && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none z-50 max-w-[180px] truncate">
                    {cluster.cover.location_name}
                </div>
            )}
        </button>
    );
};

// ─── Cluster Photo Panel ──────────────────────────────────────────────────────
const ClusterPhotoPanel = ({ cluster, thumbnailUrl, onClose, onImageClick }) => {
    // Points are already sorted desc by date in clusterPoints()
    const photos = cluster.points;
    const { toast } = useToast();

    const [allAlbums, setAllAlbums] = useState([]);
    const [newAlbumName, setNewAlbumName] = useState(cluster.locationName || '');
    const [isAddingAlbum, setIsAddingAlbum] = useState(false);

    const fetchAlbums = async () => {
        try {
            const data = await api.albums.list();
            setAllAlbums(data || []);
        } catch (err) {
            console.error('Failed to load albums:', err);
        }
    };

    useEffect(() => {
        fetchAlbums();
    }, []);

    // Keep the prefilled name updated if the selected cluster changes
    useEffect(() => {
        setNewAlbumName(cluster.locationName || '');
    }, [cluster]);

    const handleAddToAlbum = async (albumId) => {
        const imageIds = photos.map((p) => p.id);
        try {
            setIsAddingAlbum(true);
            await api.albums.addImages(albumId, imageIds);
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
            toast({
                title: 'Success',
                description: `Added ${imageIds.length} photos to album`,
            });
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to add photos to album',
                variant: 'destructive',
            });
        } finally {
            setIsAddingAlbum(false);
        }
    };

    const handleCreateAndAddToAlbum = async (e) => {
        e.preventDefault();
        if (!newAlbumName.trim()) return;
        const imageIds = photos.map((p) => p.id);
        try {
            setIsAddingAlbum(true);
            const newAlbum = await api.albums.create(newAlbumName.trim());
            await api.albums.addImages(newAlbum.id, imageIds);
            window.dispatchEvent(new CustomEvent('pycasa-albums-updated'));
            toast({
                title: 'Success',
                description: `Created album "${newAlbumName}" with ${imageIds.length} photos`,
            });
            setNewAlbumName('');
            fetchAlbums();
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to create album',
                variant: 'destructive',
            });
        } finally {
            setIsAddingAlbum(false);
        }
    };

    // Group photos by date for section headers
    const grouped = useMemo(() => {
        const groups = [];
        let currentDate = null;
        let currentGroup = null;

        for (const photo of photos) {
            const dateLabel = formatDate(photo.date_taken) || 'Unknown date';
            if (dateLabel !== currentDate) {
                if (currentGroup) groups.push(currentGroup);
                currentDate = dateLabel;
                currentGroup = { date: dateLabel, photos: [photo] };
            } else {
                currentGroup.photos.push(photo);
            }
        }
        if (currentGroup) groups.push(currentGroup);
        return groups;
    }, [photos]);

    const locationLabel =
        cluster.locationName || (cluster.isCluster ? `${cluster.count} photos` : 'Photo');

    return (
        <div className="h-full flex-1 flex flex-col bg-[#0c0c10] border-l border-white/[0.07] animate-in slide-in-from-right-4 duration-300 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06] shrink-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-white/40 shrink-0" />
                        <span className="text-white/90 text-sm font-semibold truncate">
                            {locationLabel}
                        </span>
                    </div>
                    <p className="text-white/30 text-xs mt-0.5 pl-6">
                        {cluster.count} asset{cluster.count !== 1 ? 's' : ''} · newest first
                    </p>
                </div>

                {/* Add to Album Popover */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            title="Add all to album"
                            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/50 hover:text-white transition-colors shrink-0"
                        >
                            <FolderClosed className="w-4 h-4" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-64 p-3 bg-zinc-950 border border-zinc-800 text-white shadow-2xl rounded-xl space-y-3 z-50"
                        align="end"
                    >
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-zinc-400">
                                Add cluster to Album
                            </p>
                            <div className="max-h-32 overflow-y-auto space-y-1 no-scrollbar">
                                {allAlbums.length > 0 ? (
                                    allAlbums.map((album) => (
                                        <div
                                            key={album.id}
                                            className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-white/5 text-zinc-200 transition-colors"
                                        >
                                            <span className="truncate flex-1 pr-2">
                                                {album.name}
                                            </span>
                                            <button
                                                onClick={() => handleAddToAlbum(album.id)}
                                                className="text-indigo-400 hover:text-indigo-300 p-1 rounded transition-colors shrink-0 hover:bg-indigo-500/10"
                                                title="Add to this album"
                                                disabled={isAddingAlbum}
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))
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
                                <div className="flex gap-1.5">
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
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-1 rounded disabled:opacity-50 flex items-center justify-center shrink-0"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </form>
                        </div>
                    </PopoverContent>
                </Popover>

                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/50 hover:text-white transition-colors shrink-0"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Photo grid — scrollable */}
            <div
                className="flex-1 overflow-y-auto overscroll-contain"
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(255,255,255,0.1) transparent',
                }}
            >
                {grouped.map((group) => (
                    <div key={group.date} className="mb-1">
                        {/* Date section header */}
                        <div className="flex items-center gap-2 px-4 py-2 sticky top-0 bg-[#0c0c10]/95 backdrop-blur-sm z-10">
                            <Calendar className="w-3 h-3 text-white/30" />
                            <span className="text-white/40 text-[11px] font-medium">
                                {group.date}
                            </span>
                        </div>
                        {/* Grid */}
                        <div
                            className="grid gap-0.5 px-1"
                            style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
                        >
                            {group.photos.map((photo) => (
                                <PhotoThumb
                                    key={photo.id}
                                    photo={photo}
                                    thumbnailUrl={thumbnailUrl(photo)}
                                    onClick={() => onImageClick(photo)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Photo Thumbnail ──────────────────────────────────────────────────────────
const PhotoThumb = ({ photo, thumbnailUrl, onClick }) => {
    const [loaded, setLoaded] = useState(false);

    return (
        <button
            onClick={onClick}
            className="group relative aspect-square overflow-hidden bg-white/[0.04] focus:outline-none"
            title={photo.location_name || formatDate(photo.date_taken) || ''}
        >
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-white/10" />
                </div>
            )}
            <img
                src={thumbnailUrl}
                alt=""
                onLoad={() => setLoaded(true)}
                onError={(e) => {
                    e.target.style.display = 'none';
                    setLoaded(true);
                }}
                className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:brightness-110 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-150 pointer-events-none" />
        </button>
    );
};

export default PlacesView;
