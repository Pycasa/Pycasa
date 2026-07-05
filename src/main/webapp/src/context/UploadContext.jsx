import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const UploadContext = createContext(null);

export const useUpload = () => {
    const ctx = useContext(UploadContext);
    if (!ctx) throw new Error('useUpload must be used within UploadProvider');
    return ctx;
};

export const UploadProvider = ({ children }) => {
    const [state, setState] = useState({
        uploading: false,
        current: 0,
        total: 0,
        currentFile: '',
        failed: 0,
    });
    const cancelRef = useRef(false);

    const startUpload = useCallback((total) => {
        cancelRef.current = false;
        setState({ uploading: true, current: 0, total, currentFile: '', failed: 0 });
    }, []);

    const updateProgress = useCallback((current, currentFile) => {
        setState((prev) => ({ ...prev, current, currentFile }));
    }, []);

    const finishUpload = useCallback((failed = 0) => {
        setState((prev) => ({ ...prev, uploading: false, failed, currentFile: '' }));
        // Auto-clear after 2s
        setTimeout(() => {
            setState({ uploading: false, current: 0, total: 0, currentFile: '', failed: 0 });
        }, 2000);
    }, []);

    const cancel = useCallback(() => {
        cancelRef.current = true;
        setState((prev) => ({ ...prev, uploading: false, currentFile: '' }));
    }, []);

    const isCancelled = useCallback(() => cancelRef.current, []);

    return (
        <UploadContext.Provider
            value={{ state, startUpload, updateProgress, finishUpload, cancel, isCancelled }}
        >
            {children}
        </UploadContext.Provider>
    );
};
