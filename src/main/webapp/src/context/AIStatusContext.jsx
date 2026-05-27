import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

const AIStatusContext = createContext();

export const useAIStatus = () => {
    const context = useContext(AIStatusContext);
    if (!context) {
        throw new Error('useAIStatus must be used within an AIStatusProvider');
    }
    return context;
};

export const AIStatusProvider = ({ children }) => {
    const [aiStatus, setAiStatus] = useState(null);

    useEffect(() => {
        let interval;
        const checkAiStatus = async () => {
            try {
                const status = await api.ai.getAnalysisStatus();
                setAiStatus(status);
            } catch (error) {
                console.error("Failed to fetch AI status:", error);
            }
        };

        checkAiStatus();
        interval = setInterval(checkAiStatus, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <AIStatusContext.Provider value={{ aiStatus }}>
            {children}
        </AIStatusContext.Provider>
    );
};
