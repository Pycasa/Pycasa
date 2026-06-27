import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { motion, AnimatePresence } from 'framer-motion';
import AdminLogin from '@/components/admin/AdminLogin';
import ImageManager from '@/components/ImageManager';
import FolderSettings from '@/components/FolderSettings';
import TimelineView from '@/components/TimelineView.jsx';
import FavoritesView from '@/components/FavoritesView';
import TrashView from '@/components/TrashView';
import PlacesView from '@/components/PlacesView';
import NotificationsPage from '@/pages/NotificationsPage';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

const AdminPage = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [username, setUsername] = useState('');
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const activeTab = location.pathname.startsWith('/gallery')
        ? 'gallery'
        : location.pathname.startsWith('/favorites')
          ? 'favorites'
          : location.pathname.startsWith('/trash')
            ? 'trash'
            : location.pathname.startsWith('/places')
              ? 'places'
              : location.pathname.startsWith('/settings')
                ? 'settings'
                : location.pathname.startsWith('/notifications')
                  ? 'notifications'
                  : location.pathname.startsWith('/photos')
                    ? location.state?.background?.startsWith('/gallery')
                        ? 'gallery'
                        : location.state?.background?.startsWith('/favorites')
                          ? 'favorites'
                          : location.state?.background?.startsWith('/trash')
                            ? 'trash'
                            : 'timeline'
                    : 'timeline';

    const { toast } = useToast();

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const session = await api.auth.getSession();
                setIsAuthenticated(!!session);
                if (session?.user) {
                    setUsername(session.user.name || session.user.email || 'Admin');
                }
            } catch {
                setIsAuthenticated(false);
            } finally {
                setCheckingAuth(false);
            }
        };
        checkAuth();
    }, []);

    const handleLoginSuccess = () => {
        setIsAuthenticated(true);
        toast({ title: 'Welcome back', description: 'You have successfully logged in.' });
        window.location.reload();
    };

    const handleLogout = async () => {
        await api.auth.logout();
        setIsAuthenticated(false);
        toast({ title: 'Logged Out', description: 'See you next time.' });
    };

    if (checkingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <>
                <Helmet>
                    <title>Admin Login | Pycasa</title>
                </Helmet>
                <AdminLogin onLoginSuccess={handleLoginSuccess} />
            </>
        );
    }

    return (
        <div className="min-h-screen bg-white dark:bg-[#060913] flex transition-colors duration-200 overflow-hidden h-screen">
            <Helmet>
                <title>Pycasa</title>
            </Helmet>

            {/* Desktop Sidebar */}
            <div className="hidden md:flex">
                <Sidebar username={username} onLogout={handleLogout} activeTab={activeTab} />
            </div>

            {/* Mobile Drawer Sidebar */}
            <AnimatePresence>
                {isMobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileOpen(false)}
                            className="fixed inset-0 bg-black z-45 md:hidden"
                        />
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'tween', duration: 0.25 }}
                            className="fixed top-0 bottom-0 left-0 z-50 md:hidden sidebar-glass"
                        >
                            <Sidebar
                                username={username}
                                onLogout={handleLogout}
                                activeTab={activeTab}
                                onItemClick={() => setIsMobileOpen(false)}
                            />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main content pane */}
            <div className="flex flex-col flex-1 h-screen overflow-hidden">
                <Header
                    onMenuClick={() => setIsMobileOpen(true)}
                    title={activeTab}
                    username={username}
                    onLogout={handleLogout}
                />

                <main className="flex-1 w-full relative overflow-hidden bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="h-full outline-none animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-hidden">
                        {activeTab === 'gallery' && <ImageManager />}
                        {activeTab === 'timeline' && <TimelineView />}
                        {activeTab === 'favorites' && <FavoritesView />}
                        {activeTab === 'trash' && <TrashView />}
                        {activeTab === 'places' && <PlacesView />}
                        {activeTab === 'settings' && <FolderSettings />}
                        {activeTab === 'notifications' && <NotificationsPage />}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AdminPage;
