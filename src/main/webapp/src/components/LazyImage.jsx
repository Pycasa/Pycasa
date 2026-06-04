import React from 'react';
import useLazyImage from '@/hooks/useLazyImage';

/**
 * LazyImage component that uses IntersectionObserver to load images lazily.
 * While the image is not yet loaded, it displays a skeleton placeholder
 * with a subtle pulse animation, matching modern UI loading patterns.
 */
export default function LazyImage({ src, alt = '', className = '' }) {
  const { imgRef, url } = useLazyImage(src);



  return (
    <div ref={imgRef} className="relative w-full h-full">
      {url ? (
        <img
          src={url}
          alt={alt}
          className={`${className} w-full h-full object-cover`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
    </div>
  );
}
