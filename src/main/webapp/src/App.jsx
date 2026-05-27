import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminPage from '@/pages/AdminPage';
import NotificationsPage from '@/pages/NotificationsPage';
import { AIStatusProvider } from '@/context/AIStatusContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { ThemeProvider } from '@/context/ThemeContext';


function App() {
  return (
    <ThemeProvider>
    <HelmetProvider>
      <TooltipProvider>
        <NotificationsProvider>
          <AIStatusProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Helmet>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
              </Helmet>
              <div className="min-h-screen bg-[#F5F1ED] dark:bg-[hsl(220,15%,10%)] text-foreground transition-colors duration-200">
                <Routes>
                  <Route path="/timeline" element={<AdminPage />} />
                  <Route path="/gallery" element={<AdminPage />} />
                  <Route path="/settings" element={<AdminPage />} />
                  <Route path="/settings/*" element={<AdminPage />} />
                  <Route path="/notifications" element={<AdminPage />} />
                  <Route path="/" element={<Navigate to="/timeline" replace />} />
                  <Route path="/admin" element={<Navigate to="/timeline" replace />} />
                </Routes>
                <Toaster />
              </div>
            </Router>
          </AIStatusProvider>
        </NotificationsProvider>
      </TooltipProvider>
    </HelmetProvider >
    </ThemeProvider>
  );
}

export default App;
