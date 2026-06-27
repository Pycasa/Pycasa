import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Folder, ChevronRight, ChevronLeft, Home } from 'lucide-react';
import { api } from '@/lib/api';

const FolderPicker = ({ open, onOpenChange, onSelect }) => {
    const [currentPath, setCurrentPath] = useState('');
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [parent, setParent] = useState(null);

    useEffect(() => {
        if (open) {
            fetchDir();
        }
    }, [open]);

    const fetchDir = async (path = null) => {
        setLoading(true);
        try {
            const data = await api.folders.listDir(path);
            setCurrentPath(data.path);
            setFolders(data.entries || []);
            // TODO: parent path logic needs to be verified based on backend changes
            setParent(
                data.path === '/' || data.path.endsWith(':\\')
                    ? null
                    : data.path.substring(
                          0,
                          data.path.lastIndexOf(data.path.includes('\\') ? '\\' : '/')
                      )
            );
        } catch (error) {
            console.error('Failed to list directory', error);
            setFolders([]);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folderPath) => {
        fetchDir(folderPath);
    };

    const handleGoBack = () => {
        if (parent) {
            fetchDir(parent);
        }
    };

    const handleGoHome = () => {
        fetchDir();
    };

    const handleSelect = () => {
        onSelect(currentPath);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Select Folder</DialogTitle>
                    <DialogDescription className="sr-only">
                        Navigate and select a directory.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="flex items-start gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={handleGoHome} title="Home">
                                <Home className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleGoBack}
                                disabled={!parent}
                                title="Back"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="text-sm font-mono text-slate-600 px-2 py-2 break-all flex-1">
                            {currentPath}
                        </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg max-h-[400px] overflow-y-auto bg-white">
                        {loading ? (
                            <div className="p-8 text-center text-slate-500">Loading...</div>
                        ) : folders?.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                No folders found in this directory.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {folders?.map((folder) => (
                                    <button
                                        key={folder.path}
                                        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left transition-colors"
                                        onClick={() => handleFolderClick(folder.path)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Folder className="w-4 h-4 text-primary fill-primary/10" />
                                            <span className="text-sm font-medium text-slate-700">
                                                {folder.name}
                                            </span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-300" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="flex justify-between items-center sm:justify-between">
                    <div className="text-xs text-slate-500 hidden sm:block">
                        Choose the current directory as the source.
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSelect}>Select Current Folder</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default FolderPicker;
