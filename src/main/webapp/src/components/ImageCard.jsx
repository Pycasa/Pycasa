import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAIStatus } from '@/context/AIStatusContext';
import { Heart, Sparkles, Loader2 } from 'lucide-react';

const ImageCard = ({ image, isSelected, onSelect, rowHeight = 180, onFavoriteToggle }) => {
    const [imgData, setImgData] = useState(image);
    const { aiStatus } = useAIStatus();
    const [aspectRatio, setAspectRatio] = useState(() => {
        if (image && image.width && image.height) {
            return image.width / image.height;
        }
        return 1.4;
    });
    const [togglingFav, setTogglingFav] = useState(false);
    const imgRef = useRef(null);

    const isBeingAnalyzed = aiStatus?.is_running && aiStatus.current_file === image.full_path;
    const wasBeingAnalyzed = useRef(isBeingAnalyzed);

    useEffect(() => {
        if (wasBeingAnalyzed.current && !isBeingAnalyzed) {
            const refreshMetadata = async () => {
                try {
                    const latestData = await api.images.getMetadata(image.full_path);
                    setImgData({
                        ...latestData,
                        full_path: latestData.file_path,
                        modified: latestData.modified_at,
                        size: latestData.file_size,
                    });
                } catch (error) {
                    // silently ignore
                }
            };
            refreshMetadata();
        }
        wasBeingAnalyzed.current = isBeingAnalyzed;
    }, [isBeingAnalyzed, image.full_path]);

    useEffect(() => {
        setImgData(image);
        if (image && image.width && image.height) {
            setAspectRatio(image.width / image.height);
        }
    }, [image]);

    // Handle image load to update aspect ratio
    const handleImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth && naturalHeight) {
            setAspectRatio(naturalWidth / naturalHeight);
        }
    };

    const isFavorite = imgData.favorite || false;

    const handleFavoriteClick = async (e) => {
        e.stopPropagation();
        if (togglingFav || !imgData.id) return;
        setTogglingFav(true);

        // Optimistic update
        setImgData((prev) => ({ ...prev, favorite: !isFavorite }));

        try {
            const updated = await api.images.toggleFavorite(imgData.id);
            if (updated) {
                setImgData((prev) => ({ ...prev, favorite: updated.favorite || false }));
                if (onFavoriteToggle) onFavoriteToggle(updated);
            }
        } catch (err) {
            // Revert optimistic update on failure
            setImgData((prev) => ({ ...prev, favorite: isFavorite }));
        } finally {
            setTogglingFav(false);
        }
    };

    return (
        <div
            onClick={() => onSelect(imgData)}
            className={`group cursor-pointer overflow-hidden bg-slate-900 dark:bg-slate-950 relative border-0 shadow-none transition-all duration-300 select-none ${
                isSelected
                    ? 'ring-4 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-950 z-10'
                    : ''
            } ${isBeingAnalyzed ? 'analyzed-image-blink scale-[1.02] z-10' : ''}`}
            style={{
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: `${aspectRatio * rowHeight}px`,
                width: `${aspectRatio * rowHeight}px`,
                height: `${rowHeight}px`,
            }}
        >
            <img
                src={api.images.getThumbnail(image.full_path)}
                alt=""
                onLoad={handleImageLoad}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                loading="lazy"
            />

            {/* AI status badge — always visible, top-right corner */}
            {(isBeingAnalyzed || imgData.ai_analysed) && (
                <div
                    className="absolute top-1 right-1 z-20 flex items-center justify-center p-1 pointer-events-none"
                    title={isBeingAnalyzed ? 'AI analysis in progress…' : 'AI analysed'}
                >
                    {isBeingAnalyzed ? (
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin drop-shadow-md" />
                    ) : (
                        <img
                            src="/site-images/ai-icon.png"
                            alt="AI"
                            className="w-4 h-4 object-contain drop-shadow-md"
                        />
                    )}
                </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3.5 z-10">
                <div />

                <div className="flex items-center justify-between">
                    {/* Heart / Favorite button */}
                    {!imgData.trashed && (
                        <button
                            onClick={handleFavoriteClick}
                            disabled={togglingFav}
                            className={`transition-all duration-200 ${
                                togglingFav ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                            }`}
                            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                            <Heart
                                className={`w-5 h-5 drop-shadow-md transition-all duration-200 ${
                                    isFavorite
                                        ? 'fill-rose-500 text-rose-500 scale-110'
                                        : 'text-white/80 hover:text-rose-400 hover:scale-110 opacity-0 group-hover:opacity-100'
                                }`}
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* Always-visible favorite indicator (when not hovered) */}
            {isFavorite && !imgData.trashed && (
                <div className="absolute bottom-2 left-2 z-10 group-hover:opacity-0 transition-opacity duration-200">
                    <Heart className="w-4 h-4 fill-rose-500 text-rose-500 drop-shadow-md" />
                </div>
            )}
        </div>
    );
};

export default ImageCard;
