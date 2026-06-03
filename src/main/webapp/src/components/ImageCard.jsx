import React from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAIStatus } from '@/context/AIStatusContext';
import LazyImage from '@/components/LazyImage';


const ImageCard = ({ image, isSelected, onSelect }) => {
    const [imgData, setImgData] = React.useState(image);
    // Removed raw image URL; using thumbnail via LazyImage
    const { aiStatus } = useAIStatus();

    const isBeingAnalyzed = aiStatus?.is_running && aiStatus.current_file === image.full_path;
    const wasBeingAnalyzed = React.useRef(isBeingAnalyzed);

    React.useEffect(() => {
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

    React.useEffect(() => {
        setImgData(image);
    }, [image]);

    return (
        <Card
            onClick={() => onSelect(imgData)}
            className={`group cursor-pointer overflow-hidden transition-all border-2 rounded-none ${
                isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-slate-200'
            } ${isBeingAnalyzed ? 'analyzed-image-blink scale-[1.02] z-10' : ''}`}
        >
            <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
              <LazyImage
            src={api.images.getThumbnail(image.full_path)}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {/* Prefetch full image on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
        </Card>
    );
};

export default ImageCard;
