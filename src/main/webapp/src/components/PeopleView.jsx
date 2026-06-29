import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { ScanFace, Search, Loader2, Edit2, ArrowRight, Camera } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const PeopleView = () => {
    const navigate = useNavigate();
    const [faces, setFaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingFaceId, setEditingFaceId] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const editingIdRef = React.useRef(null);

    // Merge confirmation state
    const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
    const [pendingMergeFace, setPendingMergeFace] = useState(null);
    const [pendingMergeName, setPendingMergeName] = useState('');
    const [pendingMergeTargetFace, setPendingMergeTargetFace] = useState(null);

    // Representative cover photo state
    const [coverDialogOpen, setCoverDialogOpen] = useState(false);
    const [coverDialogFace, setCoverDialogFace] = useState(null);
    const [selectedCoverFaceId, setSelectedCoverFaceId] = useState(null);
    const [savingCover, setSavingCover] = useState(false);

    const fetchFaces = async () => {
        try {
            const data = await api.face.listFaces();
            setFaces(data || []);
        } catch (err) {
            console.error('Failed to load faces:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFaces();
    }, []);

    const executeSaveName = async (faceId, name) => {
        try {
            await api.face.updateFaceName(faceId, name || null);
            await fetchFaces();
        } catch (err) {
            console.error('Failed to save face name:', err);
        }
    };

    const handleSaveInlineName = async (face) => {
        if (editingIdRef.current !== face.id) return;
        editingIdRef.current = null;
        setEditingFaceId(null);

        const trimmed = editNameValue.trim();
        if (trimmed === (face.name || '')) return;

        // Check if a person with this name already exists
        const exists = groupedFaces.some(
            (f) => f.name && f.name.toLowerCase() === trimmed.toLowerCase() && f.id !== face.id
        );

        if (exists) {
            const existingPerson = groupedFaces.find(
                (f) => f.name && f.name.toLowerCase() === trimmed.toLowerCase()
            );
            setPendingMergeFace(face);
            setPendingMergeName(existingPerson.name);
            setPendingMergeTargetFace(existingPerson);
            setMergeConfirmOpen(true);
            return;
        }

        await executeSaveName(face.id, trimmed);
    };

    const handleConfirmMerge = async () => {
        if (!pendingMergeFace) return;
        setMergeConfirmOpen(false);
        await executeSaveName(pendingMergeFace.id, pendingMergeName);
        setPendingMergeFace(null);
        setPendingMergeName('');
        setPendingMergeTargetFace(null);
    };

    const handleOpenCoverDialog = (face) => {
        setCoverDialogFace(face);
        setSelectedCoverFaceId(face.id);
        setCoverDialogOpen(true);
    };

    const handleSaveCover = async () => {
        if (!selectedCoverFaceId || !coverDialogFace) return;
        setSavingCover(true);
        try {
            await api.face.setFaceCover(selectedCoverFaceId);
            await fetchFaces();
            setCoverDialogOpen(false);
        } catch (err) {
            console.error('Failed to set cover face:', err);
        } finally {
            setSavingCover(false);
        }
    };

    const handleCancelMerge = () => {
        setMergeConfirmOpen(false);
        setPendingMergeFace(null);
        setPendingMergeName('');
        setPendingMergeTargetFace(null);
    };

    // Grouping logic:
    // Named faces are grouped by their name.
    // Unnamed faces are kept separate.
    const groupFaces = (allFaces) => {
        const namedGroups = {};
        const unnamedList = [];

        allFaces.forEach((face) => {
            if (face.name) {
                const normName = face.name.trim();
                if (!namedGroups[normName]) {
                    namedGroups[normName] = {
                        id: face.id,
                        name: normName,
                        thumbnail_path: face.thumbnail_path,
                        file_path: face.file_path,
                        faceIds: [face.id],
                        count: 1,
                    };
                } else {
                    namedGroups[normName].faceIds.push(face.id);
                    namedGroups[normName].count += 1;
                }
            } else {
                unnamedList.push({
                    id: face.id,
                    name: '',
                    thumbnail_path: face.thumbnail_path,
                    file_path: face.file_path,
                    faceIds: [face.id],
                    count: 1,
                });
            }
        });

        // Sort named groups alphabetically
        const sortedNamed = Object.values(namedGroups).sort((a, b) => a.name.localeCompare(b.name));

        // Unnamed list stays in its database order (newest first)
        return [...sortedNamed, ...unnamedList];
    };

    const groupedFaces = groupFaces(faces);

    const filteredFaces = groupedFaces.filter((face) => {
        if (!searchQuery) return true;
        const name = face.name || 'unnamed';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const handleCardClick = (face) => {
        if (face.name) {
            navigate(`/timeline?person=${encodeURIComponent(face.name)}`);
        } else {
            navigate(`/timeline?face_id=${face.id}`);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-900/20 overflow-hidden">
            {/* Header bar */}
            <div className="sticky top-0 z-20 flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 bg-white/80 dark:bg-[#060913]/80 backdrop-blur border-b border-slate-200/60 dark:border-white/[0.06] shrink-0">
                <div className="flex items-center gap-3">
                    <ScanFace className="w-5 h-5 text-indigo-500" />
                    <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                        People
                    </h1>
                    {!loading && faces.length > 0 && (
                        <span className="text-[12px] text-slate-400 dark:text-white/30 ml-1">
                            {groupedFaces.length} person/group{groupedFaces.length !== 1 ? 's' : ''}{' '}
                            identified
                        </span>
                    )}
                </div>

                {/* Search box */}
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/30" />
                    <input
                        type="text"
                        placeholder="Search people..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl focus:outline-none focus:border-indigo-500/50 text-slate-800 dark:text-white"
                    />
                </div>
            </div>

            {/* Scrollable grid area */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-white/40">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-xs">Loading people...</span>
                    </div>
                ) : filteredFaces.length === 0 ? (
                    <div className="h-full w-full flex flex-col items-center justify-center text-center p-8 text-slate-400 dark:text-white/30">
                        <ScanFace className="w-12 h-12 stroke-[1.2] mb-3 text-slate-300 dark:text-white/10" />
                        <p className="text-sm font-medium">No people found</p>
                        <p className="text-xs mt-1 max-w-xs leading-relaxed">
                            {searchQuery
                                ? 'Try adjusting your search query.'
                                : 'Start face detection from the sidebar to identify faces in your photos.'}
                        </p>
                    </div>
                ) : (
                    <motion.div
                        layout
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
                    >
                        {filteredFaces.map((face) => (
                            <motion.div
                                layout
                                key={face.id}
                                whileHover={{ scale: 1.03 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            >
                                <Card className="overflow-hidden border border-slate-200/60 dark:border-white/[0.05] bg-white dark:bg-[#09090b] hover:border-indigo-500/30 dark:hover:border-indigo-500/30 transition-all cursor-pointer shadow-sm hover:shadow-md select-none group">
                                    {/* Image area (navigates to timeline of photos containing this person) */}
                                    <div
                                        onClick={() => handleCardClick(face)}
                                        title={
                                            face.name
                                                ? `View all photos of ${face.name}`
                                                : 'View photo containing this face'
                                        }
                                        className="aspect-square w-full bg-slate-100 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center"
                                    >
                                        <img
                                            src={api.face.getFaceThumbnailUrl(face.id)}
                                            alt={face.name || 'Face'}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                        {/* Change cover photo button */}
                                        {face.name && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenCoverDialog(face);
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/85 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg border border-white/10 z-10"
                                                title="Choose representative photo"
                                            >
                                                <Camera className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Inline name editing area */}
                                    <div className="p-3 text-center min-h-[44px] flex items-center justify-center">
                                        {editingFaceId === face.id ? (
                                            <input
                                                type="text"
                                                value={editNameValue}
                                                onChange={(e) => setEditNameValue(e.target.value)}
                                                onBlur={() => handleSaveInlineName(face)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleSaveInlineName(face);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        editingIdRef.current = null;
                                                        setEditingFaceId(null);
                                                    }
                                                }}
                                                className="w-full text-xs text-center border border-indigo-500 rounded px-1.5 py-0.5 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingFaceId(face.id);
                                                    editingIdRef.current = face.id;
                                                    setEditNameValue(face.name || '');
                                                }}
                                                className="group/name flex items-center justify-center gap-1.5 cursor-pointer w-full"
                                                title="Click to rename"
                                            >
                                                <p
                                                    className={`text-xs font-semibold truncate max-w-[80%] ${face.name ? 'text-slate-850 dark:text-white' : 'text-slate-400 dark:text-white/30 italic'}`}
                                                >
                                                    {face.name || 'Unnamed'}
                                                </p>
                                                {face.count > 1 ? (
                                                    <span className="text-[10px] bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded-full font-medium shrink-0">
                                                        {face.count}
                                                    </span>
                                                ) : (
                                                    <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>

            {/* Merge Confirmation Dialog */}
            <Dialog open={mergeConfirmOpen} onOpenChange={(open) => !open && handleCancelMerge()}>
                <DialogContent className="max-w-sm bg-white dark:bg-[#09090b] border-slate-200 dark:border-zinc-800">
                    <DialogHeader className="space-y-4">
                        {/* Side-by-side Profile Circles */}
                        <div className="flex items-center justify-center gap-5 py-2">
                            {pendingMergeFace && (
                                <div className="flex flex-col items-center gap-1">
                                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-indigo-500 shadow-md bg-slate-150 dark:bg-zinc-800">
                                        <img
                                            src={api.face.getFaceThumbnailUrl(pendingMergeFace.id)}
                                            alt="Source face"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 italic max-w-[70px] truncate text-center">
                                        {pendingMergeFace.name || 'Unnamed'}
                                    </span>
                                </div>
                            )}

                            <ArrowRight className="w-4 h-4 text-slate-400 dark:text-zinc-600 shrink-0 mt-[-16px]" />

                            {pendingMergeTargetFace && (
                                <div className="flex flex-col items-center gap-1">
                                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-indigo-600 shadow-md bg-slate-150 dark:bg-zinc-800">
                                        <img
                                            src={api.face.getFaceThumbnailUrl(
                                                pendingMergeTargetFace.id
                                            )}
                                            alt="Target face"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-900 dark:text-zinc-300 font-semibold max-w-[70px] truncate text-center">
                                        {pendingMergeTargetFace.name}
                                    </span>
                                </div>
                            )}
                        </div>

                        <DialogTitle className="text-center text-slate-950 dark:text-white text-base font-semibold">
                            Merge people?
                        </DialogTitle>
                        <DialogDescription className="text-center text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                            An existing person is already named{' '}
                            <strong className="text-slate-900 dark:text-white font-semibold">
                                "{pendingMergeName}"
                            </strong>
                            . Would you like to merge this face into their group?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-white/[0.05] pt-3 mt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleCancelMerge}
                            className="text-xs h-9"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirmMerge}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
                        >
                            Yes, Merge
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Choose Representative Photo Dialog */}
            <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
                <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#09090b] border-slate-200 dark:border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-slate-950 dark:text-white">
                            Choose Representative Photo
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 dark:text-zinc-400">
                            Select a photo to represent {coverDialogFace?.name} in the People view.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        {coverDialogFace && (
                            <div className="grid grid-cols-4 gap-3 max-h-[280px] overflow-y-auto p-2 bg-slate-50 dark:bg-zinc-900/50 rounded-lg border border-slate-100 dark:border-white/[0.03]">
                                {faces
                                    .filter(
                                        (f) =>
                                            f.name &&
                                            f.name.toLowerCase() ===
                                                coverDialogFace.name.toLowerCase()
                                    )
                                    .map((f) => (
                                        <div
                                            key={f.id}
                                            onClick={() => setSelectedCoverFaceId(f.id)}
                                            className={`aspect-square rounded-full overflow-hidden border-2 cursor-pointer transition-all relative group/thumb ${
                                                selectedCoverFaceId === f.id
                                                    ? 'border-indigo-600 ring-2 ring-indigo-500/30 scale-95 shadow-md'
                                                    : 'border-transparent hover:border-slate-300 dark:hover:border-zinc-700 hover:scale-105'
                                            }`}
                                        >
                                            <img
                                                src={api.face.getFaceThumbnailUrl(f.id)}
                                                alt="Face Option"
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 border-t border-slate-100 dark:border-white/[0.05] pt-3">
                        <Button
                            variant="ghost"
                            onClick={() => setCoverDialogOpen(false)}
                            className="text-xs h-9"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveCover}
                            disabled={savingCover}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
                        >
                            {savingCover ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PeopleView;
