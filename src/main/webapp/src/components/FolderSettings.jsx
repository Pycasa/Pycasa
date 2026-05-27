import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Folder, Plus, Trash2, HardDrive, AlertCircle, CheckCircle2, FolderOpen, Bot, Settings2, Info, Save, Loader2, PlayCircle, Play, RotateCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import FolderPicker from './FolderPicker';
import CreatableSelect from 'react-select/creatable';
import { useTheme } from '@/context/ThemeContext';

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
    const [aiService, setAiService] = useState('ollama');
    const [embeddingModel, setEmbeddingModel] = useState('nomic-embed-text');
    const [aiSettingsSaved, setAiSettingsSaved] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [analysisStatus, setAnalysisStatus] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [ollamaReachable, setOllamaReachable] = useState(null);
    const [isPinging, setIsPinging] = useState(false);

    // OCR Settings State
    const [tesseractDatapath, setTesseractDatapath] = useState('');
    const [jnaLibraryPath, setJnaLibraryPath] = useState('');

    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigate();
    const { theme } = useTheme();

    const isDark = theme === 'dark';
    const selectStyles = {
        control: (base, state) => ({
            ...base,
            borderRadius: '0.375rem',
            backgroundColor: isDark ? 'hsl(220,15%,18%)' : '#fff',
            borderColor: state.isFocused
                ? 'hsl(153,38%,40%)'
                : isDark ? 'hsl(220,15%,28%)' : '#e2e8f0',
            boxShadow: state.isFocused ? '0 0 0 1px hsl(153,38%,40%)' : 'none',
            minHeight: '40px',
            '&:hover': { borderColor: isDark ? 'hsl(220,15%,38%)' : '#cbd5e1' },
        }),
        menu: (base) => ({
            ...base,
            zIndex: 50,
            backgroundColor: isDark ? 'hsl(220,15%,18%)' : '#fff',
            border: `1px solid ${isDark ? 'hsl(220,15%,28%)' : '#e2e8f0'}`,
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
                ? 'hsl(153,38%,40%)'
                : state.isFocused
                    ? isDark ? 'hsl(220,15%,25%)' : '#f1f5f9'
                    : 'transparent',
            color: state.isSelected ? '#fff' : isDark ? 'hsl(40,20%,92%)' : '#0f172a',
            cursor: 'pointer',
        }),
        singleValue: (base) => ({
            ...base,
            color: isDark ? 'hsl(40,20%,92%)' : '#0f172a',
        }),
        input: (base) => ({
            ...base,
            color: isDark ? 'hsl(40,20%,92%)' : '#0f172a',
        }),
        placeholder: (base) => ({
            ...base,
            color: isDark ? 'hsl(220,10%,45%)' : '#94a3b8',
        }),
        clearIndicator: (base) => ({
            ...base,
            color: isDark ? 'hsl(220,10%,55%)' : '#94a3b8',
            '&:hover': { color: isDark ? '#fff' : '#0f172a' },
        }),
        dropdownIndicator: (base) => ({
            ...base,
            color: isDark ? 'hsl(220,10%,55%)' : '#94a3b8',
            '&:hover': { color: isDark ? '#fff' : '#0f172a' },
        }),
        indicatorSeparator: (base) => ({
            ...base,
            backgroundColor: isDark ? 'hsl(220,15%,28%)' : '#e2e8f0',
        }),
    };

    // Derive active tab from URL
    const pathParts = location.pathname.split('/').filter(Boolean); // e.g., ['settings', 'ai-settings']
    const activeMainTab = pathParts[1] || 'scan-locations';

    const handleMainTabChange = (value) => {
        navigate(`/settings/${value}`);
    };

    const handleRunAnalysis = async (rerun = false) => {
        try {
            setIsAnalyzing(true);
            await api.ai.batchAnalyse(rerun);
            toast({
                title: rerun ? "Rerunning Analysis" : "Starting Analysis",
                description: "AI analysis has been triggered in the background.",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to start AI analysis: " + error.message,
                variant: "destructive",
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        if (!ollamaUrl) {
            setOllamaReachable(null);
            return;
        }

        const controller = new AbortController();
        validateOllamaUrl(ollamaUrl, controller.signal);

        return () => controller.abort();
    }, [ollamaUrl]);

    useEffect(() => {
        if (ollamaReachable === true) {
            fetchModels(ollamaUrl);
        }
    }, [ollamaReachable, ollamaUrl]);

    const validateOllamaUrl = async (url, signal) => {
        setIsPinging(true);
        setOllamaReachable(null);
        try {
            const status = await api.ai.ping(url, signal);
            setOllamaReachable(status);
        } catch (error) {
            if (error.name === 'AbortError') return;
            setOllamaReachable(false);
        } finally {
            if (!signal.aborted) {
                setIsPinging(false);
            }
        }
    };

    useEffect(() => {
        fetchMonitoredFolders();
        fetchTrashPath();
        loadAiSettings();
        fetchModels();
    }, []);

    const fetchModels = async (url = null) => {
        try {
            const models = await api.ai.listModels(url);
            setAvailableModels(models || []);
        } catch (error) {
            console.error("Failed to fetch Ollama models:", error);
        }
    };

    const loadAiSettings = async () => {
        try {
            // Fetch saved settings and server-side defaults in parallel
            const [settings, defaults] = await Promise.all([
                api.settings.get(),
                api.defaults.prompts(),
            ]);
            if (settings.ollama_url) setOllamaUrl(settings.ollama_url);
            if (settings.vision_model) setVisionModel(settings.vision_model);
            if (settings.text_model) setTextModel(settings.text_model);
            if (settings.gemini_api_key) setGeminiApiKey(settings.gemini_api_key);
            if (settings.openai_api_key) setOpenaiApiKey(settings.openai_api_key);
            if (settings.openai_model) setOpenaiModel(settings.openai_model);
            if (settings.active_ai_service) setAiService(settings.active_ai_service);
            // Use saved value if present, otherwise fall back to server default
            setImageAnalysisPrompt(settings.image_analysis_prompt || defaults.image_analysis_prompt || '');
            if (settings.embedding_model) setEmbeddingModel(settings.embedding_model);
            if (settings.ocr_tesseract_datapath) setTesseractDatapath(settings.ocr_tesseract_datapath);
            if (settings.ocr_jna_library_path) setJnaLibraryPath(settings.ocr_jna_library_path);
        } catch (error) {
            console.error("Failed to load AI settings:", error);
        }
    };

    const saveAiSettings = async () => {
        try {
            await api.settings.update({
                ollama_url: ollamaUrl,
                vision_model: visionModel,
                text_model: textModel,
                gemini_api_key: geminiApiKey,
                openai_api_key: openaiApiKey,
                openai_model: openaiModel,
                active_ai_service: aiService,
                image_analysis_prompt: imageAnalysisPrompt,
                embedding_model: embeddingModel,
                ocr_tesseract_datapath: tesseractDatapath,
                ocr_jna_library_path: jnaLibraryPath
            });

            setAiSettingsSaved(true);
            setTimeout(() => setAiSettingsSaved(false), 2000);

            toast({ title: "AI Settings Saved", description: "Your AI configuration has been updated." });
        } catch (error) {
            toast({
                title: "Failed to save settings",
                description: error.message,
                variant: "destructive"
            });
        }
    };

    const fetchTrashPath = async () => {
        try {
            const data = await api.folders.getTrashPath();
            setTrashPath(data.path);
        } catch (error) {
            console.error("Failed to fetch trash path");
        }
    };

    const fetchMonitoredFolders = async () => {
        try {
            const data = await api.folders.listMonitored();
            setMonitoredFolders(data);
        } catch (error) {
            toast({ title: "Failed to fetch scan locations", variant: "destructive" });
        }
    };

    const handleAddFolder = async (e) => {
        e.preventDefault();
        if (!newPath) return;

        setDuplicateError('');

        const normalizedNewPath = newPath.trim().replace(/\\/g, '/').replace(/\/$/, '');
        const isDuplicate = monitoredFolders.some(folder => {
            const normalizedExisting = folder.path.trim().replace(/\\/g, '/').replace(/\/$/, '');
            return normalizedExisting.toLowerCase() === normalizedNewPath.toLowerCase();
        });

        if (isDuplicate) {
            setDuplicateError('This folder is already in your monitored locations list.');
            return;
        }

        setLoading(true);
        try {
            await api.folders.addMonitored(newPath, newLabel);
            toast({ title: "Location added", description: "Successfully added to monitor list." });
            setNewPath('');
            setNewLabel('');
            setDuplicateError('');
            fetchMonitoredFolders();
        } catch (error) {
            toast({
                title: "Failed to add location",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBrowse = () => {
        setPickerOpen(true);
    };

    const handlePickerSelect = (path) => {
        setDuplicateError('');
        setNewPath(path);
        // Auto-fill label with the last folder name
        const separator = path.includes('\\') ? '\\' : '/';
        const parts = path.split(separator);
        const folderName = parts[parts.length - 1] || parts[parts.length - 2] || path; // Handle trailing slash if present
        setNewLabel(folderName);
    };

    const handleRemoveFolder = async (id) => {
        if (window.confirm('Stop monitoring this folder? No files will be deleted.')) {
            try {
                await api.folders.removeMonitored(id);
                toast({ title: "Folder removed" });
                fetchMonitoredFolders();
            } catch (error) {
                toast({ title: "Failed to remove folder", variant: "destructive" });
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-4 py-4 animate-in fade-in duration-500">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
                <p className="text-slate-500 dark:text-slate-400">Configure your scan locations and AI preferences.</p>
            </div>

            <Tabs value={activeMainTab} onValueChange={handleMainTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-8">
                    <TabsTrigger value="scan-locations" className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4" />
                        Scan
                    </TabsTrigger>
                    <TabsTrigger value="ai-settings" className="flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        AI Settings
                    </TabsTrigger>
                    <TabsTrigger value="ocr-settings" className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4" />
                        OCR Settings
                    </TabsTrigger>
                    <TabsTrigger value="trash-location" className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Trash
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="scan-locations" className="space-y-8">
                    <Card className="p-4 bg-white/50 backdrop-blur-sm border-slate-200">
                        <div className="space-y-2">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 mb-4">Add New Scan Location</h3>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center text-center space-y-3">
                                    <div className="p-3 bg-primary/10 rounded-full text-primary mb-1">
                                        <FolderOpen className="w-4 h-4" />
                                    </div>
                                    <div className="space-y-1">
                                        {/* <h4 className="font-medium text-slate-900">Browse System</h4> */}
                                        <p className="text-xs text-slate-500 max-w-sm">Select a location from your computer to scan for images.</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="default"
                                        onClick={handleBrowse}
                                        className="w-full sm:w-auto text-xs"
                                    >
                                        <FolderOpen className="w-4 h-4 mr-2" />
                                        Browse Locations
                                    </Button>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-200" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-2 text-slate-500">Or enter path manually</span>
                                </div>
                            </div>

                            <form onSubmit={handleAddFolder} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Local Path</Label>
                                        <Input
                                            placeholder="Enter full path to the location you want to include for scan"
                                            value={newPath}
                                            onChange={(e) => setNewPath(e.target.value)}
                                            className="bg-white text-sm placeholder:text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Display Label (Optional)</Label>
                                        <Input
                                            placeholder="My Photos"
                                            value={newLabel}
                                            onChange={(e) => setNewLabel(e.target.value)}
                                            className="bg-white text-sm placeholder:text-xs"
                                        />
                                    </div>
                                </div>
                                {duplicateError && (
                                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                                        <span>{duplicateError}</span>
                                    </div>
                                )}
                                <div className="flex justify-end">
                                    <Button type="submit" className="text-xs" disabled={loading || !newPath}>
                                        {loading ? <Plus className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                        Add Location
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </Card>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <HardDrive className="w-5 h-5 text-primary" />
                            Monitored Locations
                        </h3>

                        {monitoredFolders.length === 0 ? (
                            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No folders are currently being monitored.</p>
                                <p className="text-sm">Add a folder path above to start scanning for images.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {monitoredFolders.map((folder) => (
                                    <Card key={folder.id} className="p-4 flex items-center justify-between group bg-white hover:border-primary/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                                                <Folder className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-900">{folder.label || folder.name}</h4>
                                                <p className="text-xs text-slate-500 font-mono">{folder.path}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase tracking-wider">
                                                <CheckCircle2 className="w-3 h-3" />
                                                Active
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveFolder(folder.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="trash-location" className="space-y-8">
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-red-500" />
                            Trash Location
                        </h3>
                        <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500">Deleted images will be moved here. Removing an image from Pycasa does not delete it from your local storage—it is simply moved to this trash location.</p>
                                <div className="flex flex-col sm:flex-row gap-4 items-end">
                                    <div className="flex-grow space-y-2 w-full">
                                        <Label>Pycasa Trash Location (cannot be changed)</Label>
                                        <Input
                                            value={trashPath}
                                            readOnly
                                            className="bg-slate-50 font-mono text-xs"
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-700 space-y-1">
                                <p className="font-medium">Note</p>
                                <p>Removing an image from Pycasa does not delete it from your local storage. Instead, the image is moved to the Pycasa Trash location shown above. To permanently delete images, you must delete the Pycasa Trash directory.</p>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="ai-settings" className="space-y-6">
                    <div className="space-y-6">

                        {/* AI Service Selection */}
                        <div className="space-y-4">
                            <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                            <Bot className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-medium text-slate-900">AI Service Selection</h3>
                                            <p className="text-sm text-slate-500">Choose which AI provider to use for image analysis and tagging.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {[
                                            { id: 'ollama', label: 'Ollama (Local)', description: 'Run models locally' },
                                            { id: 'gemini', label: 'Google Gemini', description: 'Cloud-based AI' },
                                            { id: 'openai', label: 'OpenAI (GPT-4)', description: 'Industry standard' }
                                        ].map((service) => (
                                            <div
                                                key={service.id}
                                                onClick={() => setAiService(service.id)}
                                                className={`cursor-pointer p-2 rounded-xl border-2 transition-all ${aiService === service.id
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-slate-100 bg-white hover:border-slate-200'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-semibold text-slate-900">{service.label}</span>
                                                    {aiService === service.id && (
                                                        <CheckCircle2 className="w-4 h-4 text-primary" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500">{service.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Ollama Configuration */}
                        <div className="space-y-4">
                            <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                            <Bot className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-medium text-slate-900">Ollama Configuration</h3>
                                            <p className="text-sm text-slate-500">Configure your local LLM settings for AI features.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Ollama URL</Label>
                                            <Input
                                                value={ollamaUrl}
                                                onChange={(e) => setOllamaUrl(e.target.value)}
                                                placeholder="http://localhost:11434"
                                                className="font-mono"
                                            />
                                            {isPinging && (
                                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Checking reachability...
                                                </p>
                                            )}
                                            {ollamaReachable === false && (
                                                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    Ollama server is not reachable at this URL
                                                </p>
                                            )}
                                            {ollamaReachable === true && (
                                                <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Ollama server is reachable
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-400">The URL where your Ollama instance is running.</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Vision Model</Label>
                                                <CreatableSelect
                                                    isClearable
                                                    options={availableModels.map(m => ({ value: m, label: m }))}
                                                    value={visionModel ? { value: visionModel, label: visionModel } : null}
                                                    onChange={(newValue) => setVisionModel(newValue ? newValue.value : '')}
                                                    onCreateOption={(inputValue) => {
                                                        const newOption = { value: inputValue, label: inputValue };
                                                        setAvailableModels(prev => [...prev, inputValue]);
                                                        setVisionModel(inputValue);
                                                    }}
                                                    placeholder="Select or type model..."
                                                    className="text-sm"
                                                    styles={selectStyles}
                                                />
                                                <p className="text-xs text-slate-400 mt-1">Model used for image analysis (e.g., llava, moondream, bakllava).</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Text Model</Label>
                                                <CreatableSelect
                                                    isClearable
                                                    options={availableModels.map(m => ({ value: m, label: m }))}
                                                    value={textModel ? { value: textModel, label: textModel } : null}
                                                    onChange={(newValue) => setTextModel(newValue ? newValue.value : '')}
                                                    onCreateOption={(inputValue) => {
                                                        const newOption = { value: inputValue, label: inputValue };
                                                        setAvailableModels(prev => [...prev, inputValue]);
                                                        setTextModel(inputValue);
                                                    }}
                                                    placeholder="Select or type model..."
                                                    className="text-sm"
                                                    styles={selectStyles}
                                                />
                                                <p className="text-xs text-slate-400 mt-1">Model used for text generation and chat (e.g., llama2, mistral).</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Embedding Model</Label>
                                                <CreatableSelect
                                                    isClearable
                                                    options={availableModels.map(m => ({ value: m, label: m }))}
                                                    value={embeddingModel ? { value: embeddingModel, label: embeddingModel } : null}
                                                    onChange={(newValue) => setEmbeddingModel(newValue ? newValue.value : '')}
                                                    onCreateOption={(inputValue) => {
                                                        const newOption = { value: inputValue, label: inputValue };
                                                        setAvailableModels(prev => [...prev, inputValue]);
                                                        setEmbeddingModel(inputValue);
                                                    }}
                                                    placeholder="Select or type model..."
                                                    className="text-sm"
                                                    styles={selectStyles}
                                                />
                                                <p className="text-xs text-slate-400 mt-1">Model used for generating vector embeddings (e.g., nomic-embed-text).</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Image Analysis Prompt</Label>
                                            <textarea
                                                value={imageAnalysisPrompt}
                                                onChange={(e) => setImageAnalysisPrompt(e.target.value)}
                                                placeholder="Enter the prompt for image analysis..."
                                                className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ring-offset-white placeholder:text-slate-500 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                                            />
                                            <p className="text-xs text-slate-400">The instructions given to the Vision model to interpret the image content.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Tag Generation Prompt</Label>
                                            <textarea
                                                value={tagGenerationPrompt}
                                                onChange={(e) => setTagGenerationPrompt(e.target.value)}
                                                placeholder="Enter the prompt for generating tags..."
                                                className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ring-offset-white placeholder:text-slate-500 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                                            />
                                            <p className="text-xs text-slate-400">The instructions given to the LLM to convert the image description into tags.</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-700 space-y-1">
                                    <p className="font-medium">About Local AI</p>
                                    <p>Pycasa supports integration with Ollama, allowing you to run AI models and perform image analysis entirely on your local machine. Make sure Ollama is installed, running, and that the required models have been pulled before using this feature.</p>
                                    <p className="text-xs mt-2">Example commands:</p>
                                    <code className="block bg-blue-100 p-2 rounded text-blue-800 font-mono text-xs whitespace-pre">
                                        ollama pull llava{'\n'}
                                        ollama pull llama2{'\n'}
                                        ollama pull moondream:1.8b{'\n'}
                                        ollama pull gemma3:270m
                                    </code>
                                </div>
                            </div>
                        </div>

                        {/* Gemini Configuration */}
                        <div className="space-y-4">
                            <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                            <Bot className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-medium text-slate-900">Google Gemini Configuration</h3>
                                            <p className="text-sm text-slate-500">Configure your Gemini API settings.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>API Key</Label>
                                            <Input
                                                type="password"
                                                value={geminiApiKey}
                                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                                placeholder="Enter your Gemini API key"
                                                className="font-mono"
                                            />
                                            <p className="text-xs text-slate-400">Your Google AI Studio API key for Gemini models.</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-700 space-y-1">
                                    <p className="font-medium">Getting Started with Gemini</p>
                                    <p>Get your API key from Google AI Studio at <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">makersuite.google.com</a></p>
                                </div>
                            </div>
                        </div>

                        {/* OpenAI Configuration */}
                        <div className="space-y-4">
                            <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                                            <Bot className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-medium text-slate-900">OpenAI Configuration</h3>
                                            <p className="text-sm text-slate-500">Configure your OpenAI API settings.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>API Key</Label>
                                            <Input
                                                type="password"
                                                value={openaiApiKey}
                                                onChange={(e) => setOpenaiApiKey(e.target.value)}
                                                placeholder="sk-..."
                                                className="font-mono"
                                            />
                                            <p className="text-xs text-slate-400">Your OpenAI API key.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Vision Model</Label>
                                            <Input
                                                value={openaiModel}
                                                onChange={(e) => setOpenaiModel(e.target.value)}
                                                placeholder="gpt-4-vision-preview"
                                            />
                                            <p className="text-xs text-slate-400">Model to use for image analysis (e.g., gpt-4-vision-preview, gpt-4o).</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-700 space-y-1">
                                    <p className="font-medium">Getting Started with OpenAI</p>
                                    <p>Get your API key from the OpenAI platform at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com</a></p>
                                </div>
                            </div>
                        </div>

                        {/* AI Analysis */}
                        <div className="space-y-4">
                            <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                                            <PlayCircle className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-medium text-slate-900">AI Analysis</h3>
                                            <p className="text-sm text-slate-500">Run batch analysis on your images to generate descriptions and tags.</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-4">
                                        <Button
                                            onClick={() => handleRunAnalysis(false)}
                                            disabled={isAnalyzing}
                                            className="flex items-center gap-2"
                                            title="Run analysis on images that have not been analyzed yet."
                                        >
                                            <Play className="w-4 h-4" />
                                            Run analysis
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => handleRunAnalysis(true)}
                                            disabled={isAnalyzing}
                                            className="flex items-center gap-2"
                                            title="Re-processes all images, overwriting existing descriptions and tags."
                                        >
                                            <RotateCw className="w-4 h-4" />
                                            Rerun analysis
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        </div>

                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button
                            onClick={saveAiSettings}
                            className={aiSettingsSaved ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                            {aiSettingsSaved ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Saved!
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Settings
                                </>
                            )}
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="ocr-settings" className="space-y-6">
                    <Card className="p-6 bg-white/50 backdrop-blur-sm border-slate-200">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                    <Settings2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-slate-900">OCR Configuration</h3>
                                    <p className="text-sm text-slate-500">Configure Tesseract OCR settings for text extraction.</p>
                                </div>
                            </div>

                            <div className="w-full bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                <Info className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />

                                <div className="w-full text-xs text-blue-700 space-y-1">
                                    <p className="w-full font-medium">About OCR</p>
                                    <p className="w-full">
                                        OCR is Optical Character Recognition - a technology that converts scanned or handwritten text into machine-readable text. Pycasa supports integration with Tesseract, a popular open-source OCR engine.
                                    </p>
                                    <p className="w-full font-medium">Make sure Tesseract is installed before using OCR.</p>
                                    <p className="w-full text-xs mt-2 pt-4 font-medium">For MacOS:</p>
                                    <code className="w-full block bg-blue-100 p-2 rounded text-blue-800 font-mono text-xs whitespace-pre">
                                        brew install tesseract{'\n'}
                                        brew install tesseract-lang{'\n'}
                                    </code>
                                    <p>Then find where your tesseract library is installed. It should be something like <code className="font-mono text-xs whitespace-pre bg-blue-200 p-0 rounded">/opt/homebrew/lib</code></p>
                                    <p>Set the JNA library path to this location in the JNA Library Path field.</p>

                                    <p className="pt-4">Then find where your tessdata is installed. Run this to find the path: </p>
                                    <code className="w-full block bg-blue-100 p-2 rounded text-blue-800 font-mono text-xs whitespace-pre">
                                        ls /opt/homebrew/Cellar/tesseract/*/share/tessdata
                                    </code>

                                    <p>Now, set the Tesseract Data Path to this location in the Tesseract Data Path field.</p>

                                    <p className="w-full text-xs mt-2 pt-4 font-medium">For Linux:</p>
                                    <code className="w-full block bg-blue-100 p-2 rounded text-blue-800 font-mono text-xs whitespace-pre">
                                        yum install tesseract{'\n'}
                                        yum install tesseract-langpack-eng
                                    </code>
                                </div>
                            </div>


                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Tesseract Data Path</Label>
                                    <Input
                                        value={tesseractDatapath}
                                        onChange={(e) => setTesseractDatapath(e.target.value)}
                                        placeholder="/usr/local/share/tessdata"
                                        className="font-mono text-xs"
                                    />
                                    <p className="text-xs text-slate-400">Path to the directory containing Tesseract .traineddata files (TESSDATA_PREFIX).</p>
                                </div>

                                <div className="space-y-2">
                                    <Label>JNA Library Path</Label>
                                    <Input
                                        value={jnaLibraryPath}
                                        onChange={(e) => setJnaLibraryPath(e.target.value)}
                                        placeholder="/usr/local/lib"
                                        className="font-mono text-xs"
                                    />
                                    <p className="text-xs text-slate-400">Path to the directory containing Tesseract native libraries (libtesseract).</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <div className="pt-4 flex justify-end">
                        <Button
                            onClick={saveAiSettings}
                            className={aiSettingsSaved ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                            {aiSettingsSaved ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Saved!
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Settings
                                </>
                            )}
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>

            <FolderPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onSelect={handlePickerSelect}
            />

        </div>
    );
};

export default FolderSettings;
