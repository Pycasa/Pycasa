import { useEffect, useRef, useState } from 'react';

/**
 * Hook that lazy‑loads an image URL when the element enters the viewport.
 * It returns a ref to attach to the <img> (or any element) and the resolved src.
 * The observer uses a 200px rootMargin to start loading a bit before the image is visible.
 */
export default function useLazyImage(src) {
  const [url, setUrl] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setUrl(src);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px' }
    );
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [src]);

  return { imgRef, url };
}
