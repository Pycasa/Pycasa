import React, { useState, useEffect, useRef } from 'react';
import { Tag, Info, Trash2, Move, Save, Plus, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Clipboard, Sparkles, Calendar, HardDrive, Image as ImageIcon, Folder as FolderIcon, Eye, EyeOff, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { formatFileSize } from '@/lib/utils';
import { useAIStatus } from '@/context/AIStatusContext';

const ImageDetailModal = ({ image, isOpen, onClose, onUpdate, onNext, onPrevious, hasNext, hasPrevious }) => {
    const { aiStatus } = useAIStatus();
    const [description, setDescription] = useState(image?.description || '');
    const [newTag, setNewTag] = useState('');
    const [tags, setTags] = useState(image?.tags || []);
    const [isSaving, setIsSaving] = useState(false);
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [isRunningOCR, setIsRunningOCR] = useState(false);
    const [embeddings, setEmbeddings] = useState(image?.embeddings || null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [showDetails, setShowDetails] = useState(() => {
        const saved = localStorage.getItem('pycasa_show_details');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const isBeingAnalyzed = aiStatus?.is_running && aiStatus.current_file === image?.full_path;
    const wasBeingAnalyzed = useRef(isBeingAnalyzed);

    useEffect(() => {
        if (wasBeingAnalyzed.current && !isBeingAnalyzed && isOpen && image?.full_path) {
            const refreshMetadata = async () => {
                try {
                    const latestData = await api.images.getMetadata(image.full_path);
                    setDescription(latestData.description || '');
                    setTags(latestData.tags || []);
                    setEmbeddings(latestData.embeddings || null);
                } catch (error) {
                    console.error("Failed to refresh image metadata in modal:", error);
                }
            };
            refreshMetadata();
        }
        wasBeingAnalyzed.current = isBeingAnalyzed;
    }, [isBeingAnalyzed, image?.full_path, isOpen]);

    // Pan & Zoom State
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imageContainerRef = useRef(null);

    const { toast } = useToast();

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;

            // Check if user is typing in an input
            const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

            if (e.key === 'ArrowLeft' && hasPrevious) {
                onPrevious();
            } else if (e.key === 'ArrowRight' && hasNext) {
                onNext();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
                handleDelete();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, hasNext, hasPrevious, onNext, onPrevious, image]);

    // Update state when image prop changes
    useEffect(() => {
        if (image) {
            // Only update local state if the image ID/path actually changed
            // This prevents resets if the parent re-renders and passes a new object literal
            setDescription(prev => (prev === image.description ? prev : (image.description || '')));
            setTags(prev => (JSON.stringify(prev) === JSON.stringify(image.tags) ? prev : (image.tags || [])));
            setEmbeddings(prev => (JSON.stringify(prev) === JSON.stringify(image.embeddings) ? prev : (image.embeddings || null)));

            // Reset Pan/Zoom
            setScale(1);
            setPosition({ x: 0, y: 0 });

            // Reset dimensions while loading new ones
            setDimensions({ width: 0, height: 0 });

            // Fetch dimensions lazily
            const fetchDimensions = async () => {
                try {
                    const data = await api.images.getDetails(image.full_path);
                    setDimensions(data);
                } catch (error) {
                    console.error("Failed to fetch dimensions:", error);
                }
            };

            if (isOpen) {
                fetchDimensions();
            }
        }
    }, [image?.id, image?.full_path, isOpen]); // Use specific fields with optional chaining

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.images.updateMetadata({
                id: image.id,
                folder_id: image.folder_id,
                path: image.full_path,
                description,
                tags,
                embeddings
            });
            toast({ title: "Metadata updated", description: "All changes have been saved." });
            onUpdate();
        } catch (error) {
            toast({ title: "Update failed", variant: "destructive", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleOCR = async () => {
        setIsRunningOCR(true);
        try {
            const result = await api.ai.ocr(image.full_path);
            if (result.text) {
                setDescription(prev => {
                    const separator = prev ? '\n\n' : '';
                    return prev + separator + result.text;
                });
                toast({
                    title: "OCR Complete",
                    description: "Extracted text added to description."
                });
            } else {
                toast({
                    title: "OCR Complete",
                    description: "No text found in image.",
                    variant: "warning"
                });
            }
        } catch (error) {
            toast({
                title: "OCR Failed",
                variant: "destructive",
                description: error.message
            });
        } finally {
            setIsRunningOCR(false);
        }
    };

    const handleAnalyse = async () => {
        setIsAnalysing(true);
        try {
            const result = await api.ai.analyse(image.full_path);

            if (result.error) {
                toast({
                    title: "Analysis failed",
                    variant: "destructive",
                    description: result.error
                });
                return;
            }

            // Update tags and description from AI response
            if (result.tags) {
                setTags(result.tags);
            }
            if (result.description) {
                setDescription(result.description);
            }
            if (result.embeddings) {
                setEmbeddings(result.embeddings);
            }

            toast({
                title: "Analysis Complete",
                description: "Tags and description have been generated."
            });
        } catch (error) {
            toast({
                title: "Analysis failed",
                variant: "destructive",
                description: error.message
            });
        } finally {
            setIsAnalysing(false);
        }
    };

    const handleAddTag = (e) => {
        e.preventDefault();
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this image? [Note]: The image will not be permanently deleted; it will be moved to the Pycasa Trash.')) {
            try {
                await api.images.delete(image.folder_id, image.path);
                toast({ title: "Image deleted" });
                onUpdate();
                onClose();
            } catch (error) {
                toast({ title: "Delete failed", variant: "destructive" });
            }
        }
    };

    const toggleDetails = () => {
        setShowDetails(prev => {
            const next = !prev;
            localStorage.setItem('pycasa_show_details', JSON.stringify(next));
            return next;
        });
    };

    // Pan & Zoom Handlers
    const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 5));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.5, 1));
    const handleReset = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

    const onMouseDown = (e) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const onMouseMove = (e) => {
        if (isDragging && scale > 1) {
            e.preventDefault();
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const onMouseUp = () => setIsDragging(false);

    const onWheel = (e) => {
        // Prevent default scroll behavior if zooming is possible or happening
        if (scale > 1 || e.deltaY < 0) {
            // e.preventDefault(); // React's synthetic event wrapper might not prevent native browser scroll with just this, but we are in a fixed dialog usually.
        }

        if (e.deltaY < 0) {
            handleZoomIn();
        } else {
            handleZoomOut();
        }
    };

    const handleCopyPath = async () => {
        try {
            await navigator.clipboard.writeText(image.full_path);
            toast({ title: "Copied image location to clipboard" });
        } catch (error) {
            toast({ title: "Failed to copy path", variant: "destructive" });
        }
    };

    if (!image) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl h-[98vh] flex flex-col p-0 gap-0 overflow-hidden">
                {/* Header (Hidden mostly but good for accessibility/structure) */}
                <DialogHeader className="sr-only">
                    <DialogTitle>{image.name}</DialogTitle>
                    <DialogDescription>Image details and preview</DialogDescription>
                </DialogHeader>

                {/* Main Content Area: Split View */}
                <div className="flex-grow flex flex-col md:flex-row h-full overflow-hidden">

                    {/* Image Preview - Top (mobile) or Left/Center (desktop) */}
                    <div className="flex-grow bg-slate-950 flex items-center justify-center p-4 overflow-hidden relative group">
                        <div className="absolute top-2 right-2 z-10 flex gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-white/50 hover:text-white hover:bg-black/40 rounded-full"
                                onClick={toggleDetails}
                                title={showDetails ? "Hide details" : "Show details"}
                            >
                                {showDetails ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-white/50 hover:text-white hover:bg-black/40 rounded-full"
                                onClick={onClose}
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Navigation Buttons */}
                        {hasPrevious && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white/50 hover:text-white hover:bg-black/40 rounded-full h-12 w-12 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); onPrevious(); }}
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </Button>
                        )}
                        {hasNext && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white/50 hover:text-white hover:bg-black/40 rounded-full h-12 w-12 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); onNext(); }}
                            >
                                <ChevronRight className="w-8 h-8" />
                            </Button>
                        )}

                        {/* Zoom Controls Overlay */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/60 rounded-full p-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-white/80 hover:text-white hover:bg-white/20" onClick={handleZoomOut}>
                                <ZoomOut className="w-4 h-4" />
                            </Button>
                            <span className="text-white/80 text-xs w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-white/80 hover:text-white hover:bg-white/20" onClick={handleZoomIn}>
                                <ZoomIn className="w-4 h-4" />
                            </Button>
                            <div className="w-px h-4 bg-white/20 mx-1" />
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-white/80 hover:text-white hover:bg-white/20" onClick={handleReset}>
                                <RotateCcw className="w-3 h-3" />
                            </Button>
                        </div>

                        <div
                            className="w-full h-full flex items-center justify-center overflow-hidden"
                            ref={imageContainerRef}
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                            onWheel={onWheel}
                            style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                        >
                            <img
                                src={api.images.getRawUrl(image.full_path)}
                                alt={image.name}
                                className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-75 ease-linear will-change-transform"
                                style={{
                                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                    pointerEvents: 'none', // Prevent image drag default behavior
                                    userSelect: 'none'
                                }}
                            />
                        </div>
                        {/* <div className="absolute top-4 left-4 text-white/50 text-xs font-mono bg-black/50 px-2 py-1 rounded pointer-events-none">
                            {Math.round(image.size / 1024)} KB • {new Date(image.modified).toLocaleDateString()} • {dimensions.width}x{dimensions.height} px • {image.full_path}
                        </div> */}
                    </div>

                    {/* Details Panel - Bottom (mobile) or Right/Bottom (desktop) */}
                    {/* User asked for details in bottom of popup. 
                    {/* User asked for details in bottom of popup.
                        Let's make it a bottom section.
                    */}
                </div>

                {/* Bottom Details Section */}
                {showDetails && (
                    <div className="bg-white border-t border-slate-200">
                        {/* Minimal Metadata Bar */}
                        <div className="flex items-center gap-6 px-4 py-2 bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                            <div className="flex items-center gap-2 group truncate w-full">
                                <FolderIcon className="w-3 h-3" />
                                <span className="truncate">{image.full_path}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={handleCopyPath}
                                >
                                    <Clipboard className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 px-4 py-2 bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest font-bold">

                            <div className="flex items-center gap-2">
                                <HardDrive className="w-3 h-3" />
                                <span>{formatFileSize(image.size)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <ImageIcon className="w-3 h-3" />
                                <span>{dimensions.width} &times; {dimensions.height} px</span>
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(image.modified).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-8">
                                {/* Description */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Info className="w-3 h-3" />
                                        Description
                                    </label>
                                    <Textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="resize-none text-xs min-h-[100px] border-slate-200 focus:border-slate-400 focus:ring-0 transition-colors"
                                        placeholder="Add a detailed description..."
                                    />
                                </div>

                                {/* Tags */}
                                <div className="space-y-2 flex flex-col h-full">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Tag className="w-3 h-3" />
                                        Tags
                                    </label>
                                    <div className="space-y-2 flex-grow flex flex-col">
                                        <form onSubmit={handleAddTag} className="flex gap-2">
                                            <Input
                                                value={newTag}
                                                onChange={(e) => setNewTag(e.target.value)}
                                                placeholder="Add tag..."
                                                className="h-8 text-xs border-slate-200 focus:border-slate-400 focus:ring-0 transition-colors"
                                            />
                                            <Button type="submit" size="sm" variant="secondary" className="h-8 w-8 p-0 bg-slate-100 hover:bg-slate-200 text-slate-600">
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </form>
                                        <div className="flex flex-wrap gap-1.5 content-start bg-slate-50/50 rounded-lg p-3 flex-grow border border-slate-100/50 min-h-[60px] max-h-[100px] overflow-y-auto">
                                            {tags.map(tag => (
                                                <Badge key={tag} variant="secondary" className="pl-2 pr-1 h-6 gap-1 text-[10px] font-medium bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                                                    {tag}
                                                    <X
                                                        className="w-3 h-3 cursor-pointer hover:text-red-500 transition-colors"
                                                        onClick={() => removeTag(tag)}
                                                    />
                                                </Badge>
                                            ))}
                                            {tags.length === 0 && (
                                                <div className="flex items-center justify-center w-full h-full text-[10px] text-slate-400 italic">
                                                    No tags yet
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Row */}
                            <div className="flex items-center justify-center gap-4 pt-2">
                                <Button
                                    onClick={handleAnalyse}
                                    disabled={isAnalysing}
                                    variant="outline"
                                    className="h-9 px-8 text-xs font-bold uppercase tracking-widest bg-gradient-to-r from-pink-50 to-pink-100 hover:from-pink-100 hover:to-pink-100 border-pink-100 text-pink-700 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Sparkles className={`w-3.5 h-3.5 mr-2 ${isAnalysing ? 'animate-spin' : ''}`} />
                                    {isAnalysing ? 'Analysing...' : 'AI Analyse'}
                                </Button>

                                <Button
                                    onClick={handleOCR}
                                    disabled={isRunningOCR}
                                    variant="outline"
                                    className="h-9 px-8 text-xs font-bold uppercase tracking-widest bg-gradient-to-r from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-100 border-orange-100 text-orange-700 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <ScanText className={`w-3.5 h-3.5 mr-2 ${isRunningOCR ? 'animate-pulse' : ''}`} />
                                    {isRunningOCR ? 'Scanning...' : 'OCR'}
                                </Button>

                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="h-9 px-8 text-xs font-bold uppercase tracking-widest bg-green-900 hover:bg-green-600 text-white transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Save className="w-3.5 h-3.5 mr-2" />
                                    {isSaving ? 'Saving...' : 'Save'}
                                </Button>

                                <div className="w-px h-6 bg-slate-200 mx-2" />

                                <Button
                                    variant="ghost"
                                    onClick={handleDelete}
                                    className="h-9 px-4 text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-600 hover:bg-red-50 transition-all active:scale-95"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

            </DialogContent>
        </Dialog >
    );
};

export default ImageDetailModal;
