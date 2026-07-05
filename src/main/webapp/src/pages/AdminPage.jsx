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
import PeopleView from '@/components/PeopleView';
import AlbumsView from '@/components/AlbumsView';
import NotificationsPage from '@/pages/NotificationsPage';
import UploadProgressToast from '@/components/UploadProgressToast';
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

    // activeTab determines which view component is rendered in the main panel
    const getActiveTab = () => {
        const pathname = location.pathname;

        if (pathname.startsWith('/gallery')) return 'gallery';
        if (pathname.startsWith('/favorites')) return 'favorites';
        if (pathname.startsWith('/albums')) return 'albums';
        if (pathname.startsWith('/trash')) return 'trash';
        if (pathname.startsWith('/places')) return 'places';
        if (pathname.startsWith('/people')) return 'people';
        if (pathname.startsWith('/settings')) return 'settings';
        if (pathname.startsWith('/notifications')) return 'notifications';

        if (pathname.startsWith('/photos')) {
            const bg = location.state?.background || '';
            if (bg.startsWith('/gallery')) return 'gallery';
            if (bg.startsWith('/favorites')) return 'favorites';
            if (bg.startsWith('/albums')) return 'albums';
            if (bg.startsWith('/trash')) return 'trash';
            return 'timeline';
        }

        return 'timeline';
    };

    const activeTab = getActiveTab();

    // sidebarActiveTab determines which tab is highlighted in the sidebar
    const getSidebarActiveTab = () => {
        const pathname = location.pathname;
        const search = location.search;

        if (pathname.startsWith('/gallery')) return 'gallery';
        if (pathname.startsWith('/favorites')) return 'favorites';
        if (pathname.startsWith('/albums')) return 'albums';
        if (pathname.startsWith('/trash')) return 'trash';
        if (pathname.startsWith('/places')) return 'places';
        if (pathname.startsWith('/people')) return 'people';
        if (pathname.startsWith('/settings')) return 'settings';
        if (pathname.startsWith('/notifications')) return 'notifications';

        if (pathname.startsWith('/timeline')) {
            const params = new URLSearchParams(search);
            if (params.has('person') || params.has('face_id')) {
                return 'people';
            }
            return 'timeline';
        }

        if (pathname.startsWith('/photos')) {
            const bg = location.state?.background || '';
            if (bg.startsWith('/gallery')) return 'gallery';
            if (bg.startsWith('/favorites')) return 'favorites';
            if (bg.startsWith('/albums')) return 'albums';
            if (bg.startsWith('/trash')) return 'trash';

            // Check if background is a person's timeline
            try {
                const bgUrl = new URL(bg, window.location.origin);
                if (bgUrl.pathname.startsWith('/timeline')) {
                    const bgParams = bgUrl.searchParams;
                    if (bgParams.has('person') || bgParams.has('face_id')) {
                        return 'people';
                    }
                }
            } catch (e) {
                // Fallback if URL parsing fails
            }
            return 'timeline';
        }

        return 'timeline';
    };

    const sidebarActiveTab = getSidebarActiveTab();

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
                <Sidebar username={username} onLogout={handleLogout} activeTab={sidebarActiveTab} />
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
                                activeTab={sidebarActiveTab}
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
                    title={sidebarActiveTab}
                    username={username}
                    onLogout={handleLogout}
                />

                <main className="flex-1 w-full relative overflow-hidden bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="h-full outline-none animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-hidden">
                        {activeTab === 'gallery' && <ImageManager />}
                        {activeTab === 'timeline' && <TimelineView />}
                        {activeTab === 'favorites' && <FavoritesView />}
                        {activeTab === 'albums' && <AlbumsView />}
                        {activeTab === 'trash' && <TrashView />}
                        {activeTab === 'places' && <PlacesView />}
                        {activeTab === 'people' && <PeopleView />}
                        {activeTab === 'settings' && <FolderSettings />}
                        {activeTab === 'notifications' && <NotificationsPage />}
                    </div>
                </main>
            </div>

            {/* Global upload progress toast */}
            <UploadProgressToast />
        </div>
    );
};

export default AdminPage;
