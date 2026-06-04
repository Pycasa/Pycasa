import React, { createContext, useContext } from 'react';
import { useNotifications } from '@/context/NotificationsContext';

const AIStatusContext = createContext();

export const useAIStatus = () => {
    const context = useContext(AIStatusContext);
    if (!context) {
        throw new Error('useAIStatus must be used within an AIStatusProvider');
    }
    return context;
};

export const AIStatusProvider = ({ children }) => {
    const { aiStatus } = useNotifications();

    return (
        <AIStatusContext.Provider value={{ aiStatus }}>
            {children}
        </AIStatusContext.Provider>
    );
};
