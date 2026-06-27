import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Folder,
    Plus,
    Trash2,
    HardDrive,
    AlertCircle,
    CheckCircle2,
    FolderOpen,
    Bot,
    Settings2,
    Info,
    Save,
    Loader2,
    PlayCircle,
    Play,
    RotateCw,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Upload,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import FolderPicker from './FolderPicker';
import CreatableSelect from 'react-select/creatable';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationsContext';

/* ─────────────────────────────────────────────
   Shared dark-input textarea class (modern-like)
───────────────────────────────────────────── */
const textareaClass =
    'flex min-h-[100px] w-full rounded-md border border-white/10 dark:border-white/10 bg-slate-100 dark:bg-[#161b2e] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 font-mono resize-none';

/* ─────────────────────────────────────────────
   modern-style accordion section
───────────────────────────────────────────── */
const SettingsSection = ({
    icon: Icon,
    iconBg,
    iconColor,
    title,
    description,
    defaultOpen = false,
    children,
    onSave,
    onReset,
    saveLabel = 'Save',
    saving = false,
    saved = false,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div
            className={`rounded-2xl border transition-colors duration-200 overflow-hidden ${open ? 'border-primary/40 dark:border-primary/30' : 'border-slate-200 dark:border-white/10'} bg-white dark:bg-[#16192a]`}
        >
            {/* Header row — always visible */}
            <button
                className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors duration-150"
                onClick={() => setOpen((o) => !o)}
            >
                <span
                    className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-xl ${iconBg}`}
                >
                    <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
                </span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-primary">{title}</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                        {description}
                    </p>
                </div>
                {open ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
            </button>

            {/* Expanded body */}
            {open && (
                <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-6">
                    {children}
                    {onSave && (
                        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                            {onReset && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onReset}
                                    className="h-8 px-5 rounded-full text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    Reset
                                </Button>
                            )}
                            <Button
                                size="sm"
                                onClick={onSave}
                                disabled={saving || saved}
                                className="h-8 px-5 rounded-full text-xs font-semibold"
                            >
                                {saved ? (
                                    <>
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                        Saved
                                    </>
                                ) : saving ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                        Saving…
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-3.5 h-3.5 mr-1.5" />
                                        {saveLabel}
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/* ─────────────────────────────────────────────
   modern-style field label (blue text)
───────────────────────────────────────────── */
const FieldLabel = ({ children, required }) => (
    <label className="text-xs font-semibold text-primary flex items-center gap-0.5 mb-1">
        {children}
        {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
);

/* ─────────────────────────────────────────────
   modern-style help/info block
───────────────────────────────────────────── */
const HelpBlock = ({ children }) => (
    <div className="flex gap-2 rounded-xl bg-blue-950/20 dark:bg-blue-950/30 border border-blue-800/30 px-4 py-3 text-xs text-blue-300">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
        <div className="space-y-1">{children}</div>
    </div>
);

/* ═══════════════════════════════════════════
   Main component
═══════════════════════════════════════════ */
const FolderSettings = () => {
    // Scan Locations State
    const [monitoredFolders, setMonitoredFolders] = useState([]);
    const [newPath, setNewPath] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [trashPath, setTrashPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [duplicateError, setDuplicateError] = useState('');

    // AI Settings State
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [visionModel, setVisionModel] = useState('llava');
    const [textModel, setTextModel] = useState('llama2');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [openaiModel, setOpenaiModel] = useState('gpt-4-vision-preview');
    const [imageAnalysisPrompt, setImageAnalysisPrompt] = useState('');
    const [tagGenerationPrompt, setTagGenerationPrompt] = useState('');
    const [ollamaTimeout, setOllamaTimeout] = useState(120);
    const [aiService, setAiService] = useState('ollama');
    const [embeddingModel, setEmbeddingModel] = useState('nomic-embed-text');
    const [aiSettingsSaved, setAiSettingsSaved] = useState(false);
    const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [analysisStatus, setAnalysisStatus] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [ollamaReachable, setOllamaReachable] = useState(null);
    const [isPinging, setIsPinging] = useState(false);

    // OCR Settings State
    const [tesseractDatapath, setTesseractDatapath] = useState('');
    const [jnaLibraryPath, setJnaLibraryPath] = useState('');
    const [ocrSaved, setOcrSaved] = useState(false);
    const [ocrSaving, setOcrSaving] = useState(false);

    // Upload Settings State
    const [uploadPath, setUploadPath] = useState('');
    const [uploadSaved, setUploadSaved] = useState(false);
    const [uploadSaving, setUploadSaving] = useState(false);
    const [uploadPickerOpen, setUploadPickerOpen] = useState(false);

    const { toast } = useToast();
    const { theme } = useTheme();
    const { liveProgress } = useNotifications();

    // Track which folder IDs currently have an active scan
    const [scanningFolderIds, setScanningFolderIds] = useState(new Set());

    const isDark = theme === 'dark';
    const selectStyles = {
        control: (base, state) => ({
            ...base,
            borderRadius: '0.5rem',
            backgroundColor: isDark ? '#161b2e' : '#f8fafc',
            borderColor: state.isFocused
                ? 'hsl(217.2 91.2% 59.8%)'
                : isDark
                  ? 'rgba(255,255,255,0.10)'
                  : '#e2e8f0',
            boxShadow: state.isFocused ? '0 0 0 2px hsl(217.2 91.2% 59.8% / 0.3)' : 'none',
            minHeight: '40px',
            '&:hover': { borderColor: isDark ? 'rgba(255,255,255,0.20)' : '#cbd5e1' },
        }),
        menu: (base) => ({
            ...base,
            zIndex: 50,
            backgroundColor: isDark ? '#161b2e' : '#fff',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0'}`,
            borderRadius: '0.5rem',
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
                ? 'hsl(217.2 91.2% 59.8%)'
                : state.isFocused
                  ? isDark
                      ? 'rgba(255,255,255,0.07)'
                      : '#f1f5f9'
                  : 'transparent',
            color: state.isSelected ? '#fff' : isDark ? '#e2e8f0' : '#0f172a',
            cursor: 'pointer',
        }),
        singleValue: (base) => ({ ...base, color: isDark ? '#e2e8f0' : '#0f172a' }),
        input: (base) => ({ ...base, color: isDark ? '#e2e8f0' : '#0f172a' }),
        placeholder: (base) => ({ ...base, color: isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8' }),
        clearIndicator: (base) => ({
            ...base,
            color: isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8',
            '&:hover': { color: isDark ? '#fff' : '#0f172a' },
        }),
        dropdownIndicator: (base) => ({
            ...base,
            color: isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8',
            '&:hover': { color: isDark ? '#fff' : '#0f172a' },
        }),
        indicatorSeparator: (base) => ({
            ...base,
            backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0',
        }),
    };

    const inputClass =
        'bg-slate-100 dark:bg-[#161b2e] border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-primary focus-visible:ring-offset-0';

    // ── data fetching ──────────────────────────────────────────────────

    const fetchMonitoredFolders = useCallback(async () => {
        try {
            const folders = await api.folders.listMonitored();
            setMonitoredFolders(folders || []);
        } catch {
            setMonitoredFolders([]);
        }
    }, []);

    const fetchTrashPath = useCallback(async () => {
        try {
            const res = await api.folders.getTrashPath?.();
            if (res && res.path) setTrashPath(res.path);
        } catch {
            /* swallow */
        }
    }, []);

    useEffect(() => {
        fetchMonitoredFolders();
        fetchTrashPath();
    }, [fetchMonitoredFolders, fetchTrashPath]);

    // Sync scan-in-progress from live progress
    useEffect(() => {
        if (!liveProgress?.type) return;
        const { type, folderId } = liveProgress;
        if (type === 'scan_start' && folderId) {
            setScanningFolderIds((prev) => new Set([...prev, folderId]));
        } else if (type === 'scan_complete' || type === 'scan_error') {
            setScanningFolderIds((prev) => {
                const next = new Set(prev);
                if (folderId) next.delete(folderId);
                else next.clear();
                return next;
            });
            fetchMonitoredFolders();
        }
    }, [liveProgress, fetchMonitoredFolders]);

    // Load AI & OCR settings
    useEffect(() => {
        const load = async () => {
            try {
                const [cfg, defaults] = await Promise.all([
                    api.settings?.get?.(),
                    api.defaults.prompts().catch(() => ({})),
                ]);
                if (!cfg) return;
                // Backend returns snake_case keys
                if (cfg.active_ai_service) setAiService(cfg.active_ai_service);
                if (cfg.ollama_url) setOllamaUrl(cfg.ollama_url);
                if (cfg.vision_model) setVisionModel(cfg.vision_model);
                if (cfg.text_model) setTextModel(cfg.text_model);
                if (cfg.embedding_model) setEmbeddingModel(cfg.embedding_model);
                if (cfg.gemini_api_key) setGeminiApiKey(cfg.gemini_api_key);
                if (cfg.openai_api_key) setOpenaiApiKey(cfg.openai_api_key);
                if (cfg.openai_model) setOpenaiModel(cfg.openai_model);
                if (cfg.ocr_tesseract_datapath) setTesseractDatapath(cfg.ocr_tesseract_datapath);
                if (cfg.ocr_jna_library_path) setJnaLibraryPath(cfg.ocr_jna_library_path);
                if (cfg.upload_path) setUploadPath(cfg.upload_path);
                // Prompts: use saved value, fall back to shipped default
                setImageAnalysisPrompt(
                    cfg.image_analysis_prompt || defaults?.image_analysis_prompt || ''
                );
                setTagGenerationPrompt(
                    cfg.tag_generation_prompt || defaults?.tag_generation_prompt || ''
                );
                if (cfg.ollama_timeout !== undefined && cfg.ollama_timeout !== null) {
                    setOllamaTimeout(cfg.ollama_timeout);
                }
            } catch {
                /* swallow */
            }
        };
        load();
    }, []);

    // Ollama ping
    useEffect(() => {
        if (!ollamaUrl) {
            setOllamaReachable(null);
            return;
        }
        const timer = setTimeout(async () => {
            setIsPinging(true);
            try {
                const result = await api.ai.ping(ollamaUrl);
                setOllamaReachable(!!result);
                if (result) {
                    const models = await api.ai.listModels(ollamaUrl);
                    if (Array.isArray(models)) setAvailableModels(models);
                }
            } catch {
                setOllamaReachable(false);
            } finally {
                setIsPinging(false);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [ollamaUrl]);

    // ── handlers ──────────────────────────────────────────────────────

    const handleAddFolder = async (e) => {
        e.preventDefault();
        setDuplicateError('');
        if (!newPath) return;
        if (monitoredFolders.some((f) => f.path === newPath)) {
            setDuplicateError('This folder is already being monitored.');
            return;
        }
        setLoading(true);
        try {
            await api.folders.addMonitored(newPath, newLabel || undefined);
            toast({ title: 'Folder added', description: `Now monitoring ${newLabel || newPath}` });
            setNewPath('');
            setNewLabel('');
            setDuplicateError('');
            fetchMonitoredFolders();
        } catch (error) {
            toast({
                title: 'Failed to add location',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBrowse = async () => {
        try {
            // Ask the backend to open the OS-native folder picker dialog.
            // The Java server blocks until the user makes a selection, then
            // returns the absolute path.  A 204 means the user cancelled.
            const res = await api.folders.browse();
            if (res?.path) {
                handlePickerSelect(res.path);
            }
        } catch (err) {
            // If the native picker isn't available (headless server, etc.)
            // fall back to the in-app folder browser.
            console.warn('Native browse failed, falling back to in-app picker:', err);
            setPickerOpen(true);
        }
    };

    const handlePickerSelect = (path) => {
        setDuplicateError('');
        setNewPath(path);
        const sep = path.includes('\\') ? '\\' : '/';
        const parts = path.split(sep);
        setNewLabel(parts[parts.length - 1] || parts[parts.length - 2] || path);
    };

    const handleRemoveFolder = async (id) => {
        if (!window.confirm('Stop monitoring this folder? No files will be deleted.')) return;
        try {
            await api.folders.removeMonitored(id);
            toast({ title: 'Folder removed' });
            fetchMonitoredFolders();
        } catch {
            toast({ title: 'Failed to remove folder', variant: 'destructive' });
        }
    };

    const handleRescanFolder = async (id) => {
        try {
            await api.folders.rescanFolder(id);
            toast({ title: 'Rescan started', description: 'Scanning folder for new images.' });
        } catch (error) {
            toast({
                title: 'Failed to start rescan',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const saveAiSettings = async () => {
        setAiSettingsSaving(true);
        try {
            await api.settings.update({
                active_ai_service: aiService,
                ollama_url: ollamaUrl,
                vision_model: visionModel,
                text_model: textModel,
                embedding_model: embeddingModel,
                gemini_api_key: geminiApiKey,
                openai_api_key: openaiApiKey,
                openai_model: openaiModel,
                image_analysis_prompt: imageAnalysisPrompt,
                tag_generation_prompt: tagGenerationPrompt,
                ollama_timeout: ollamaTimeout,
            });
            setAiSettingsSaved(true);
            toast({ title: 'AI settings saved' });
            setTimeout(() => setAiSettingsSaved(false), 3000);
        } catch (error) {
            toast({
                title: 'Failed to save settings',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setAiSettingsSaving(false);
        }
    };

    const saveOcrSettings = async () => {
        setOcrSaving(true);
        try {
            await api.settings.update({
                ocr_tesseract_datapath: tesseractDatapath,
                ocr_jna_library_path: jnaLibraryPath,
            });
            setOcrSaved(true);
            toast({ title: 'OCR settings saved' });
            setTimeout(() => setOcrSaved(false), 3000);
        } catch (error) {
            toast({
                title: 'Failed to save OCR settings',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setOcrSaving(false);
        }
    };

    const saveUploadSettings = async () => {
        setUploadSaving(true);
        try {
            await api.settings.update({
                upload_path: uploadPath,
            });
            setUploadSaved(true);
            toast({ title: 'Upload settings saved' });
            setTimeout(() => setUploadSaved(false), 3000);
        } catch (error) {
            toast({
                title: 'Failed to save settings',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setUploadSaving(false);
        }
    };

    const handleBrowseUploadPath = async () => {
        try {
            const res = await api.folders.browse();
            if (res?.path) {
                setUploadPath(res.path);
            }
        } catch (err) {
            console.warn('Native browse failed, falling back to in-app picker:', err);
            setUploadPickerOpen(true);
        }
    };

    const handleRunAnalysis = async (rerun = false) => {
        try {
            setIsAnalyzing(true);
            await api.ai.batchAnalyse(rerun);
            toast({
                title: rerun ? 'Rerunning Analysis' : 'Starting Analysis',
                description: 'AI analysis has been triggered in the background.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to start AI analysis: ' + error.message,
                variant: 'destructive',
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    // ── render ────────────────────────────────────────────────────────

    return (
        <div className="w-full h-full overflow-y-auto bg-white dark:bg-[#060913]">
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">
                {/* Page heading */}
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        Settings
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Configure your scan locations, AI, OCR, and storage preferences.
                    </p>
                </div>

                {/* ── Scan Locations ─────────────────────────── */}
                <SettingsSection
                    icon={HardDrive}
                    iconBg="bg-primary/10"
                    iconColor="text-primary"
                    title="Scan Locations"
                    description="Manage the folders Pycasa monitors for photos and videos."
                    defaultOpen={true}
                >
                    {/* Add new location */}
                    <div className="space-y-4">
                        <FieldLabel>Add New Location</FieldLabel>

                        {/* Browse button */}
                        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-6 text-center">
                            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                                <FolderOpen className="w-5 h-5" />
                            </div>
                            <p className="text-xs text-slate-400">
                                Select a location from your computer to scan for images.
                            </p>
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={handleBrowse}
                                className="rounded-full text-xs h-8 px-5"
                            >
                                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                                Browse Locations
                            </Button>
                        </div>

                        {/* Divider */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-200 dark:border-white/10" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-white dark:bg-[#060913] px-3 text-[10px] uppercase tracking-widest text-slate-400">
                                    or enter path manually
                                </span>
                            </div>
                        </div>

                        {/* Manual path entry */}
                        <form onSubmit={handleAddFolder} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <FieldLabel>Local Path</FieldLabel>
                                    <Input
                                        placeholder="/Volumes/Photos"
                                        value={newPath}
                                        onChange={(e) => setNewPath(e.target.value)}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Display Label</FieldLabel>
                                    <Input
                                        placeholder="My Photos (optional)"
                                        value={newLabel}
                                        onChange={(e) => setNewLabel(e.target.value)}
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            {duplicateError && (
                                <div className="flex items-center gap-2 rounded-lg bg-red-950/30 border border-red-800/40 px-3 py-2 text-xs text-red-400">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {duplicateError}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={loading || !newPath}
                                    className="rounded-full h-8 px-5 text-xs"
                                >
                                    {loading ? (
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    )}
                                    Add Location
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Monitored folders list */}
                    {monitoredFolders.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                            <div className="flex items-center justify-between">
                                <FieldLabel>Monitored Locations</FieldLabel>
                                <span className="text-[10px] text-slate-400">
                                    {monitoredFolders
                                        .reduce((s, f) => s + (f.imageCount || 0), 0)
                                        .toLocaleString()}{' '}
                                    images total
                                </span>
                            </div>
                            {monitoredFolders.map((folder) => (
                                <div
                                    key={folder.id}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] px-4 py-3 hover:border-primary/30 transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                        <Folder className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                            {folder.label || folder.name}
                                        </p>
                                        <p className="text-[11px] text-slate-400 font-mono truncate">
                                            {folder.path}
                                        </p>
                                        {typeof folder.imageCount === 'number' && (
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                {folder.imageCount.toLocaleString()} images
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-950/40 border border-green-800/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                            Active
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRescanFolder(folder.id)}
                                            disabled={scanningFolderIds.has(folder.id)}
                                            title={
                                                scanningFolderIds.has(folder.id)
                                                    ? 'Scan in progress…'
                                                    : 'Rescan folder'
                                            }
                                            className="w-7 h-7 text-slate-400 hover:text-primary transition-colors disabled:opacity-40"
                                        >
                                            {scanningFolderIds.has(folder.id) ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveFolder(folder.id)}
                                            className="w-7 h-7 text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SettingsSection>

                {/* ── Upload Location ─────────────────────────── */}
                <SettingsSection
                    icon={Upload}
                    iconBg="bg-green-500/10"
                    iconColor="text-green-400"
                    title="Upload Location"
                    description="Configure where files uploaded via Pycasa are stored."
                    onSave={saveUploadSettings}
                    saving={uploadSaving}
                    saved={uploadSaved}
                    saveLabel="Save Upload Settings"
                >
                    <div className="space-y-4">
                        <div>
                            <FieldLabel>Upload Path</FieldLabel>
                            <div className="flex gap-2">
                                <Input
                                    value={uploadPath}
                                    onChange={(e) => setUploadPath(e.target.value)}
                                    placeholder="/path/to/uploads"
                                    className={`${inputClass} font-mono text-xs flex-1`}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleBrowseUploadPath}
                                    className="rounded-lg text-xs h-10 px-4"
                                >
                                    Browse...
                                </Button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Default: ~/.pycasa/uploads (automatically created if it doesn't
                                exist).
                            </p>
                        </div>
                    </div>
                </SettingsSection>

                {/* ── AI Settings ────────────────────────────── */}
                <SettingsSection
                    icon={Bot}
                    iconBg="bg-indigo-500/10"
                    iconColor="text-indigo-400"
                    title="AI Settings"
                    description="Choose an AI provider and configure models for image analysis and tagging."
                    onSave={saveAiSettings}
                    saving={aiSettingsSaving}
                    saved={aiSettingsSaved}
                    saveLabel="Save AI Settings"
                >
                    {/* Provider selector */}
                    <div className="space-y-2">
                        <FieldLabel>AI Provider</FieldLabel>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'ollama', label: 'Ollama', sub: 'Local models' },
                                { id: 'gemini', label: 'Gemini', sub: 'Google Cloud' },
                                { id: 'openai', label: 'OpenAI', sub: 'GPT-4 Vision' },
                            ].map((svc) => (
                                <button
                                    key={svc.id}
                                    onClick={() => setAiService(svc.id)}
                                    className={`flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-all ${
                                        aiService === svc.id
                                            ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                            : 'border-slate-200 dark:border-white/10 hover:border-primary/40 dark:hover:border-primary/30'
                                    }`}
                                >
                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        {svc.label}
                                    </span>
                                    <span className="text-[11px] text-slate-400">{svc.sub}</span>
                                    {aiService === svc.id && (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-1" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ollama config */}
                    {aiService === 'ollama' && (
                        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                Ollama Configuration
                            </p>

                            <div>
                                <FieldLabel>Ollama URL</FieldLabel>
                                <Input
                                    value={ollamaUrl}
                                    onChange={(e) => setOllamaUrl(e.target.value)}
                                    placeholder="http://localhost:11434"
                                    className={`${inputClass} font-mono`}
                                />
                                <div className="mt-1.5 text-[11px] flex items-center gap-1.5">
                                    {isPinging && (
                                        <>
                                            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                                            <span className="text-slate-400">Checking…</span>
                                        </>
                                    )}
                                    {!isPinging && ollamaReachable === true && (
                                        <>
                                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                                            <span className="text-green-400">Reachable</span>
                                        </>
                                    )}
                                    {!isPinging && ollamaReachable === false && (
                                        <>
                                            <AlertCircle className="w-3 h-3 text-red-400" />
                                            <span className="text-red-400">
                                                Cannot reach Ollama at this URL
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <FieldLabel>Vision Model</FieldLabel>
                                    <CreatableSelect
                                        isClearable
                                        options={availableModels.map((m) => ({
                                            value: m,
                                            label: m,
                                        }))}
                                        value={
                                            visionModel
                                                ? { value: visionModel, label: visionModel }
                                                : null
                                        }
                                        onChange={(v) => setVisionModel(v ? v.value : '')}
                                        onCreateOption={(v) => {
                                            setAvailableModels((p) => [...p, v]);
                                            setVisionModel(v);
                                        }}
                                        placeholder="llava…"
                                        styles={selectStyles}
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        e.g. llava, moondream, bakllava
                                    </p>
                                </div>
                                <div>
                                    <FieldLabel>Text Model</FieldLabel>
                                    <CreatableSelect
                                        isClearable
                                        options={availableModels.map((m) => ({
                                            value: m,
                                            label: m,
                                        }))}
                                        value={
                                            textModel
                                                ? { value: textModel, label: textModel }
                                                : null
                                        }
                                        onChange={(v) => setTextModel(v ? v.value : '')}
                                        onCreateOption={(v) => {
                                            setAvailableModels((p) => [...p, v]);
                                            setTextModel(v);
                                        }}
                                        placeholder="llama2…"
                                        styles={selectStyles}
                                    />
                                    <p className="text-[11px] text-slateich-400 mt-1">
                                        e.g. llama2, mistral
                                    </p>
                                </div>
                                <div>
                                    <FieldLabel>Embedding Model</FieldLabel>
                                    <CreatableSelect
                                        isClearable
                                        options={availableModels.map((m) => ({
                                            value: m,
                                            label: m,
                                        }))}
                                        value={
                                            embeddingModel
                                                ? { value: embeddingModel, label: embeddingModel }
                                                : null
                                        }
                                        onChange={(v) => setEmbeddingModel(v ? v.value : '')}
                                        onCreateOption={(v) => {
                                            setAvailableModels((p) => [...p, v]);
                                            setEmbeddingModel(v);
                                        }}
                                        placeholder="nomic-embed-text…"
                                        styles={selectStyles}
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        e.g. nomic-embed-text
                                    </p>
                                </div>
                            </div>

                            <div>
                                <FieldLabel>Image Analysis Prompt</FieldLabel>
                                <textarea
                                    value={imageAnalysisPrompt}
                                    onChange={(e) => setImageAnalysisPrompt(e.target.value)}
                                    placeholder="Analyze the provided image in comprehensive visual detail."
                                    className={textareaClass}
                                    rows={3}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Instructions given to the Vision model to interpret image
                                    content.
                                </p>
                            </div>

                            <div>
                                <FieldLabel>Tag Generation Prompt</FieldLabel>
                                <textarea
                                    value={tagGenerationPrompt}
                                    onChange={(e) => setTagGenerationPrompt(e.target.value)}
                                    placeholder="Enter the prompt for generating tags…"
                                    className={textareaClass}
                                    rows={3}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Instructions for converting image descriptions into tags.
                                </p>
                            </div>

                            <div>
                                <FieldLabel>Model Timeout (seconds)</FieldLabel>
                                <Input
                                    type="number"
                                    value={ollamaTimeout}
                                    onChange={(e) =>
                                        setOllamaTimeout(parseInt(e.target.value) || '')
                                    }
                                    className={inputClass}
                                    min={1}
                                    placeholder="120"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Max time in seconds to wait for Ollama responses before timing
                                    out.
                                </p>
                            </div>

                            <HelpBlock>
                                <p className="font-semibold text-blue-200">About Local AI</p>
                                <p>
                                    Pycasa uses Ollama for local AI. Make sure Ollama is running and
                                    the models are pulled.
                                </p>
                                <code className="block bg-blue-950/40 rounded-lg px-3 py-2 font-mono text-[11px] text-blue-300 whitespace-pre mt-1">{`ollama pull llava\nollama pull llama2\nollama pull nomic-embed-text`}</code>
                            </HelpBlock>
                        </div>
                    )}

                    {/* Gemini config */}
                    {aiService === 'gemini' && (
                        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                Google Gemini Configuration
                            </p>
                            <div>
                                <FieldLabel required>API Key</FieldLabel>
                                <Input
                                    type="password"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                    placeholder="AIza…"
                                    className={`${inputClass} font-mono`}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Your Google AI Studio API key.
                                </p>
                            </div>
                            <HelpBlock>
                                <p>
                                    Get your key from{' '}
                                    <a
                                        href="https://makersuite.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-blue-300"
                                    >
                                        makersuite.google.com
                                    </a>
                                </p>
                            </HelpBlock>
                        </div>
                    )}

                    {/* OpenAI config */}
                    {aiService === 'openai' && (
                        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                OpenAI Configuration
                            </p>
                            <div>
                                <FieldLabel required>API Key</FieldLabel>
                                <Input
                                    type="password"
                                    value={openaiApiKey}
                                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                                    placeholder="sk-…"
                                    className={`${inputClass} font-mono`}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Your OpenAI platform API key.
                                </p>
                            </div>
                            <div>
                                <FieldLabel>Vision Model</FieldLabel>
                                <Input
                                    value={openaiModel}
                                    onChange={(e) => setOpenaiModel(e.target.value)}
                                    placeholder="gpt-4-vision-preview"
                                    className={inputClass}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    e.g. gpt-4-vision-preview, gpt-4o
                                </p>
                            </div>
                            <HelpBlock>
                                <p>
                                    Get your key from{' '}
                                    <a
                                        href="https://platform.openai.com/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-blue-300"
                                    >
                                        platform.openai.com
                                    </a>
                                </p>
                            </HelpBlock>
                        </div>
                    )}

                    {/* Batch analysis */}
                    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                            Batch Analysis
                        </p>
                        <p className="text-xs text-slate-400">
                            Run AI analysis on all images to generate descriptions and tags.
                        </p>
                        <div className="flex gap-3 flex-wrap">
                            <Button
                                size="sm"
                                onClick={() => handleRunAnalysis(false)}
                                disabled={isAnalyzing}
                                className="rounded-full h-8 px-5 text-xs"
                            >
                                <Play className="w-3.5 h-3.5 mr-1.5" />
                                Run analysis
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRunAnalysis(true)}
                                disabled={isAnalyzing}
                                className="rounded-full h-8 px-5 text-xs border-slate-200 dark:border-white/10"
                            >
                                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                                Rerun (overwrite)
                            </Button>
                        </div>
                    </div>
                </SettingsSection>

                {/* ── OCR Settings ───────────────────────────── */}
                <SettingsSection
                    icon={Settings2}
                    iconBg="bg-orange-500/10"
                    iconColor="text-orange-400"
                    title="OCR Settings"
                    description="Configure Tesseract OCR for text recognition inside images."
                    onSave={saveOcrSettings}
                    saving={ocrSaving}
                    saved={ocrSaved}
                    saveLabel="Save OCR Settings"
                >
                    <HelpBlock>
                        <p className="font-semibold text-blue-200">About OCR</p>
                        <p>
                            Pycasa uses Tesseract to extract text from images. Install Tesseract
                            first.
                        </p>
                        <p className="font-medium text-blue-200 mt-1">macOS:</p>
                        <code className="block bg-blue-950/40 rounded-lg px-3 py-2 font-mono text-[11px] text-blue-300 whitespace-pre">{`brew install tesseract\nbrew install tesseract-lang`}</code>
                        <p className="font-medium text-blue-200 mt-1">Linux:</p>
                        <code className="block bg-blue-950/40 rounded-lg px-3 py-2 font-mono text-[11px] text-blue-300 whitespace-pre">{`yum install tesseract\nyum install tesseract-langpack-eng`}</code>
                    </HelpBlock>

                    <div>
                        <FieldLabel>Tesseract Data Path</FieldLabel>
                        <Input
                            value={tesseractDatapath}
                            onChange={(e) => setTesseractDatapath(e.target.value)}
                            placeholder="/opt/homebrew/Cellar/tesseract/x.x.x/share/tessdata"
                            className={`${inputClass} font-mono text-xs`}
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                            Directory containing Tesseract .traineddata files (TESSDATA_PREFIX).
                        </p>
                    </div>

                    <div>
                        <FieldLabel>JNA Library Path</FieldLabel>
                        <Input
                            value={jnaLibraryPath}
                            onChange={(e) => setJnaLibraryPath(e.target.value)}
                            placeholder="/opt/homebrew/lib"
                            className={`${inputClass} font-mono text-xs`}
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                            Directory containing Tesseract native libraries (libtesseract).
                        </p>
                    </div>
                </SettingsSection>

                {/* ── Trash Location ─────────────────────────── */}
                <SettingsSection
                    icon={Trash2}
                    iconBg="bg-red-500/10"
                    iconColor="text-red-400"
                    title="Trash Location"
                    description="Where deleted images are moved. Pycasa never permanently deletes files."
                >
                    <div>
                        <FieldLabel>Pycasa Trash Path</FieldLabel>
                        <Input
                            value={trashPath}
                            readOnly
                            className={`${inputClass} font-mono text-xs cursor-not-allowed opacity-70`}
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                            This path is managed by Pycasa and cannot be changed.
                        </p>
                    </div>
                    <HelpBlock>
                        <p>
                            Removing an image from Pycasa moves it here — it is never permanently
                            deleted. To free disk space, manually delete the files inside this
                            directory.
                        </p>
                    </HelpBlock>
                </SettingsSection>
            </div>

            <FolderPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onSelect={handlePickerSelect}
            />

            <FolderPicker
                open={uploadPickerOpen}
                onOpenChange={setUploadPickerOpen}
                onSelect={(path) => setUploadPath(path)}
            />
        </div>
    );
};

export default FolderSettings;
