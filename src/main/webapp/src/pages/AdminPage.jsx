import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '@/components/Navbar';
import AdminLogin from '@/components/admin/AdminLogin';
import ImageManager from '@/components/ImageManager';
import FolderSettings from '@/components/FolderSettings';
import TimelineView from '@/components/TimelineView.jsx';
import NotificationsPage from '@/pages/NotificationsPage';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

const AdminPage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [username, setUsername] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = location.pathname.startsWith('/gallery')       ? 'gallery'
                  : location.pathname.startsWith('/settings')      ? 'settings'
                  : location.pathname.startsWith('/notifications')  ? 'notifications'
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
    toast({ title: "Welcome back", description: "You have successfully logged in." });
    window.location.reload();
  };

  const handleLogout = async () => {
    await api.auth.logout();
    setIsAuthenticated(false);
    toast({ title: "Logged Out", description: "See you next time." });
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
        <Helmet><title>Admin Login | Pycasa</title></Helmet>
        <AdminLogin onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F1ED] dark:bg-[hsl(220,15%,10%)] flex flex-col transition-colors duration-200">
      <Helmet><title>Pycasa</title></Helmet>

      <Navbar
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        username={username}
        activeTab={activeTab}
        onTabChange={(tab) => navigate(`/${tab}`)}
      />

      <main className="flex-grow w-full px-0 py-0 relative">
        <div className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-500">
          {activeTab === 'gallery'       && <ImageManager />}
          {activeTab === 'timeline'      && <TimelineView />}
          {activeTab === 'settings'      && <FolderSettings />}
          {activeTab === 'notifications' && <NotificationsPage />}
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
