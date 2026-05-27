
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            try {
                const session = await api.auth.getSession();
                setSession(session);
            } catch (error) {
                console.error("Session check failed:", error);
                setSession(null);
            } finally {
                setLoading(false);
            }
        };

        checkSession();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F1ED]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
