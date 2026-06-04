import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, Image as ImageIcon, Settings, Calendar, Loader2, Github, Sun, Moon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAIStatus } from '@/context/AIStatusContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useTheme } from '@/context/ThemeContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import NotificationsBell from '@/components/NotificationsBell';

const ProfileMenu = ({ username, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const initial = (username || 'A').charAt(0).toUpperCase();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 dark:ring-offset-slate-900"
        aria-label="Profile menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">Signed in as</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate mt-0.5">{username || 'Admin'}</p>
            </div>
            <button
              onClick={() => { setOpen(false); navigate('/settings'); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              Settings
            </button>
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-slate-700"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Navbar = ({ isAuthenticated, onLogout, username, activeTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { scanStatus } = useNotifications();
  const isScanning = scanStatus?.is_scanning || false;
  const filesFound = scanStatus?.files_found || 0;
  const { aiStatus } = useAIStatus();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const adminNavItems = [
    { id: 'timeline', label: 'Timeline', icon: Calendar },
    { id: 'gallery',  label: 'Gallery',  icon: ImageIcon },
  ];

  return (
    <nav className="bg-white dark:bg-slate-900 shadow-md dark:shadow-slate-800/50 border-b border-transparent dark:border-slate-800 sticky top-0 z-50 transition-colors duration-200">
      <div className="w-full px-4">
        <div className="flex items-center justify-between h-16">

          <Link to="/" className="flex items-center">
            <img src="/site-images/pycasa-logo.png" alt="Pycasa Logo" className="h-16 w-auto object-contain" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-2">

            {/* Scan status pill */}
            {isAuthenticated && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-500 overflow-hidden ${isScanning ? 'bg-primary/5 text-primary w-auto opacity-100' : 'w-0 opacity-0 px-0'}`}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                  Scanning... {filesFound > 0 && `(${filesFound} files added)`}
                </span>
              </div>
            )}

            {/* AI analysis progress */}
            {isAuthenticated && aiStatus?.is_running && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500 cursor-help">
                    <div className="relative flex items-center justify-center">
                      <svg className="w-5 h-5 -rotate-90">
                        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
                        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2"
                          strokeDasharray={2 * Math.PI * 8}
                          strokeDashoffset={2 * Math.PI * 8 * (1 - (aiStatus.total_files > 0 ? aiStatus.processed_files / aiStatus.total_files : 0))}
                          strokeLinecap="round" className="transition-all duration-500 ease-out" />
                      </svg>
                      <Loader2 className="w-2.5 h-2.5 absolute animate-spin opacity-50" />
                    </div>
                    <div className="flex flex-col -space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Analyzing Images</span>
                      <span className="text-[9px] font-medium opacity-80 tabular-nums">
                        {aiStatus.processed_files} / {aiStatus.total_files} ({aiStatus.total_files > 0 ? Math.round((aiStatus.processed_files / aiStatus.total_files) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs break-all">
                  <p className="text-[10px] font-semibold text-indigo-600 mb-1">Processing:</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">{aiStatus.current_file}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Nav links */}
            {isAuthenticated && adminNavItems.map((item) => (
              <Link
                key={item.id}
                to={`/${item.id}`}
                className={`flex items-center space-x-1.5 transition-all h-9 px-2 rounded-lg text-sm font-medium ${
                  activeTab === item.id
                    ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                    : 'text-gray-700 dark:text-slate-300 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            ))}

            {isAuthenticated && (
              <>
                <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />

                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* GitHub */}
                <a
                  href="https://github.com/pycasa/pycasa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  aria-label="GitHub"
                >
                  <Github className="w-4 h-4" />
                </a>

                {/* Notifications */}
                <NotificationsBell activeTab={activeTab} />

                <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />

                {/* Profile */}
                <ProfileMenu username={username} onLogout={onLogout} />
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <div className="flex items-center md:hidden gap-4">
            <button
              className="text-gray-700 dark:text-slate-300"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="w-full px-4 py-4 space-y-2">

              {isAuthenticated && adminNavItems.map((item) => (
                <Link
                  key={item.id}
                  to={`/${item.id}`}
                  onClick={() => setIsOpen(false)}
                  className={`w-full flex items-center space-x-3 py-3 px-4 rounded-lg transition-all ${
                    activeTab === item.id
                      ? 'bg-primary text-white shadow-md'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}

              {isAuthenticated && isScanning && (
                <div className="flex items-center gap-3 py-2 px-4 bg-primary/5 rounded-lg text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Scanning... {filesFound > 0 && `(${filesFound} files added)`}
                  </span>
                </div>
              )}

              {isAuthenticated && aiStatus?.is_running && (
                <div className="flex flex-col gap-2 py-3 px-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                  <div className="flex items-center gap-4">
                    <div className="relative flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 -rotate-90">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeDasharray={2 * Math.PI * 10}
                          strokeDashoffset={2 * Math.PI * 10 * (1 - (aiStatus.total_files > 0 ? aiStatus.processed_files / aiStatus.total_files : 0))}
                          strokeLinecap="round" className="transition-all duration-500 ease-out" />
                      </svg>
                      <Loader2 className="w-3 h-3 absolute animate-spin opacity-50" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-wider">Analyzing Images</span>
                      <span className="text-[10px] font-medium opacity-80 tabular-nums">
                        {aiStatus.processed_files} / {aiStatus.total_files} ({aiStatus.total_files > 0 ? Math.round((aiStatus.processed_files / aiStatus.total_files) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                  <div className="text-[9px] text-indigo-400 bg-white/10 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-800 truncate">
                    {aiStatus.current_file}
                  </div>
                </div>
              )}

              {isAuthenticated && (
                <>
                  <div className="border-t border-gray-100 dark:border-slate-800 my-2" />
                  <div className="flex items-center gap-3 px-4 py-2">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center shrink-0">
                      {(username || 'A').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{username || 'Admin'}</span>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center space-x-3 py-3 px-4 rounded-lg transition-colors text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                  <a
                    href="https://github.com/pycasa/pycasa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-3 py-3 px-4 rounded-lg transition-colors text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    <Github className="w-5 h-5" />
                    <span className="font-medium">GitHub</span>
                  </a>
                  <Link
                    to="/settings"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center space-x-3 py-3 px-4 rounded-lg transition-colors text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    <Settings className="w-5 h-5" />
                    <span className="font-medium">Settings</span>
                  </Link>
                  <button
                    onClick={() => { setIsOpen(false); onLogout(); }}
                    className="w-full flex items-center space-x-3 py-3 px-4 rounded-lg transition-colors text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
