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
import { UploadProvider } from '@/context/UploadContext';

function App() {
    return (
        <ThemeProvider>
            <HelmetProvider>
                <TooltipProvider>
                    <NotificationsProvider>
                        <UploadProvider>
                            <AIStatusProvider>
                                <Router
                                    future={{
                                        v7_startTransition: true,
                                        v7_relativeSplatPath: true,
                                    }}
                                >
                                    <div className="min-h-screen bg-white dark:bg-[#060913] text-foreground transition-colors duration-200">
                                        <Routes>
                                            <Route path="/timeline" element={<AdminPage />} />
                                            <Route path="/gallery" element={<AdminPage />} />
                                            <Route path="/favorites" element={<AdminPage />} />
                                            <Route path="/albums" element={<AdminPage />} />
                                            <Route
                                                path="/albums/:albumId"
                                                element={<AdminPage />}
                                            />
                                            <Route path="/trash" element={<AdminPage />} />
                                            <Route path="/places" element={<AdminPage />} />
                                            <Route path="/photos/:id" element={<AdminPage />} />
                                            <Route path="/settings" element={<AdminPage />} />
                                            <Route path="/settings/*" element={<AdminPage />} />
                                            <Route path="/notifications" element={<AdminPage />} />
                                            <Route
                                                path="/"
                                                element={<Navigate to="/timeline" replace />}
                                            />
                                            <Route
                                                path="/admin"
                                                element={<Navigate to="/timeline" replace />}
                                            />
                                        </Routes>
                                        <Toaster />
                                    </div>
                                </Router>
                            </AIStatusProvider>
                        </UploadProvider>
                    </NotificationsProvider>
                </TooltipProvider>
            </HelmetProvider>
        </ThemeProvider>
    );
}

export default App;
