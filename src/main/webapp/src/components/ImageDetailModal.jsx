import React, { useState, useEffect, useRef } from 'react';
import { Tag, Info, Trash2, Move, Save, Plus, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Clipboard, Sparkles, Calendar, HardDrive, Image as ImageIcon, Folder as FolderIcon, Eye, EyeOff, ScanText, Loader2 } from 'lucide-react';
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

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent hideClose className="max-w-6xl h-[98vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="sr-only">
                    <DialogTitle>{image?.name || 'Loading...'}</DialogTitle>
                    <DialogDescription>Image details and preview</DialogDescription>
                </DialogHeader>

                {!image ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-white/50 bg-slate-950 min-h-[400px]">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                        <span>Loading image details...</span>
                    </div>
                ) : (
                    <>
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
                    <div className="bg-card border-t border-border flex flex-col shrink-0">
                        {/* File info strip */}
                        <div className="flex items-center gap-4 px-5 py-2 bg-muted/40 border-b border-border">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 group">
                                <FolderIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground truncate font-mono">{image.full_path}</span>
                                <button
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                    onClick={handleCopyPath}
                                    title="Copy path"
                                >
                                    <Clipboard className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <HardDrive className="w-3.5 h-3.5" />
                                    {formatFileSize(image.size)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    {dimensions.width > 0 ? `${dimensions.width} × ${dimensions.height}` : '—'}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {new Date(image.modified).toLocaleDateString()}
                                </span>
                            </div>
                        </div>

                        {/* Editable fields + actions */}
                        <div className="flex divide-x divide-border h-[170px]">
                            {/* Description */}
                            <div className="flex-1 p-4 flex flex-col gap-2 min-h-0">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground shrink-0">
                                    <Info className="w-3.5 h-3.5" />
                                    Description
                                </label>
                                <Textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="resize-none text-sm flex-1 min-h-0 border-border rounded-lg bg-muted/40 focus:bg-background focus:border-ring focus:ring-0 transition-colors placeholder:text-muted-foreground/50"
                                    placeholder="Add a description…"
                                />
                            </div>

                            {/* Tags */}
                            <div className="flex-1 p-4 flex flex-col gap-2 min-h-0">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground shrink-0">
                                    <Tag className="w-3.5 h-3.5" />
                                    Tags
                                </label>
                                <form onSubmit={handleAddTag} className="flex gap-2 shrink-0">
                                    <Input
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        placeholder="Type a tag and press enter…"
                                        className="h-8 text-sm border-border bg-muted/40 focus:bg-background focus:border-ring focus:ring-0 transition-colors placeholder:text-muted-foreground/50"
                                    />
                                    <Button type="submit" size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </form>
                                <div className="flex flex-wrap gap-1.5 content-start rounded-lg p-2 border border-border bg-muted/40 flex-1 overflow-y-auto min-h-0">
                                    {tags.map(tag => (
                                        <Badge key={tag} variant="secondary" className="pl-2.5 pr-1.5 h-6 gap-1 text-xs font-normal shadow-none">
                                            {tag}
                                            <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-destructive transition-colors">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                    {tags.length === 0 && (
                                        <span className="text-xs text-muted-foreground/50 italic self-center mx-auto">No tags yet</span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col justify-center gap-2 px-5 py-4 shrink-0">
                                <Button
                                    onClick={handleAnalyse}
                                    disabled={isAnalysing}
                                    variant="outline"
                                    size="sm"
                                    className="modal-btn-ai w-36 justify-start gap-2 text-xs disabled:opacity-50"
                                >
                                    <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isAnalysing ? 'animate-spin' : ''}`} />
                                    {isAnalysing ? 'Analysing…' : 'AI Analyse'}
                                </Button>
                                <Button
                                    onClick={handleOCR}
                                    disabled={isRunningOCR}
                                    variant="outline"
                                    size="sm"
                                    className="modal-btn-ocr w-36 justify-start gap-2 text-xs disabled:opacity-50"
                                >
                                    <ScanText className={`w-3.5 h-3.5 shrink-0 ${isRunningOCR ? 'animate-pulse' : ''}`} />
                                    {isRunningOCR ? 'Scanning…' : 'OCR'}
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    size="sm"
                                    className="modal-btn-save w-36 justify-start gap-2 text-xs disabled:opacity-50"
                                >
                                    <Save className="w-3.5 h-3.5 shrink-0" />
                                    {isSaving ? 'Saving…' : 'Save'}
                                </Button>
                                <div className="h-px bg-border my-0.5" />
                                <Button
                                    variant="ghost"
                                    onClick={handleDelete}
                                    size="sm"
                                    className="w-36 justify-start gap-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
                    </>
                )}

            </DialogContent>
        </Dialog >
    );
};

export default ImageDetailModal;
