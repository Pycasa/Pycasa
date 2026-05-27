
import { useState, useEffect } from 'react';
import { getPageImages, savePageImages } from '@/data/pageImages';

export const usePageImages = () => {
  const [images, setImages] = useState(getPageImages());

  useEffect(() => {
    const handleStorageChange = () => {
      setImages(getPageImages());
    };
    
    window.addEventListener('storage-images', handleStorageChange);
    // Also listen to standard storage event for cross-tab sync
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage-images', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const updateImages = (section, key, value) => {
    const newImages = {
      ...images,
      [section]: {
        ...images[section],
        [key]: value
      }
    };
    setImages(newImages);
    savePageImages(newImages);
  };

  return { images, updateImages };
};
