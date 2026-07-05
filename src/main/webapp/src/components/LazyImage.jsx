import React from 'react';
import useLazyImage from '@/hooks/useLazyImage';

/**
 * LazyImage component that uses IntersectionObserver to load images lazily.
 * While the image is not yet loaded, it displays a skeleton placeholder
 * with a subtle pulse animation, matching modern UI loading patterns.
 */
export default function LazyImage({ src, alt = '', className = '' }) {
    const { imgRef, url } = useLazyImage(src);
    const [errored, setErrored] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);

    // Reset states when src changes
    React.useEffect(() => {
        setErrored(false);
        setLoaded(false);
    }, [src]);

    return (
        <div
            ref={imgRef}
            className="relative w-full h-full overflow-hidden bg-slate-100 dark:bg-slate-800"
        >
            {!loaded && !errored && <div className="absolute inset-0 skeleton-shimmer" />}

            {url && !errored && (
                <img
                    src={url}
                    alt={alt}
                    className={`${className} w-full h-full object-cover fade-in-image ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setLoaded(true)}
                    loading="lazy"
                    decoding="async"
                    onError={() => setErrored(true)}
                />
            )}

            {errored && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 gap-1">
                    <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-slate-400"
                    >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="text-[10px] text-slate-400 font-medium">No preview</span>
                </div>
            )}
        </div>
    );
}
