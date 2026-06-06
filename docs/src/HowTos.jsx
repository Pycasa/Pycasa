import { useState, useEffect, useRef } from 'react';
import logo from './assets/logo.png';

/* ─────────────────────────────────────────────
   Section data
───────────────────────────────────────────── */
const sections = [
    {
        id: 'folders',
        icon: '📁',
        color: 'teal',
        title: 'How to add and delete a folder to monitor',
        shortTitle: 'Add & delete folders',
        steps: [
            {
                heading: 'Adding a folder',
                items: [
                    'Log in to Pycasa with your admin credentials (default: admin / admin).',
                    'Click the ⚙️ Settings icon in the top navigation bar to open Settings.',
                    'Navigate to the "Scan Images" tab.',
                    'Click the "Add Folder" button. A file-system browser dialog will appear.',
                    'Browse to the folder you want Pycasa to monitor and click "Select Folder", or type the absolute path directly into the input field.',
                    'Click "Save". Pycasa will immediately start a background scan of the folder and index all images it finds recursively.',
                    'Watch the notification bell in the top bar for real-time scan progress updates.',
                ],
            },
            {
                heading: 'Deleting / removing a folder',
                items: [
                    'Open Settings → "Scan Images" tab.',
                    'Find the folder you want to remove in the list.',
                    'Click the 🗑️ Delete (trash) icon next to the folder path.',
                    'Confirm the deletion when prompted.',
                    'The folder is removed from monitoring. Images already indexed from that folder remain in the database until you trigger a rescan or manually delete them.',
                ],
            },
        ],
        tip: 'You can add as many folders as you like, including nested paths. Pycasa scans each folder recursively, so adding a parent folder covers all its sub-folders automatically.',
    },
    {
        id: 'ai',
        icon: '🤖',
        color: 'purple',
        title: 'How to configure AI settings',
        shortTitle: 'AI settings',
        steps: [
            {
                heading: 'Choosing an AI provider',
                items: [
                    'Open Settings and navigate to the "AI Settings" tab.',
                    'Use the "AI Service" dropdown to pick one of: Ollama (local), Google Gemini (cloud), or OpenAI (cloud).',
                ],
            },
            {
                heading: 'Configuring Ollama (recommended — free & local)',
                items: [
                    'Install Ollama from ollama.com and pull a vision model: ollama pull llava',
                    'In AI Settings, set the Ollama Base URL (default: http://localhost:11434).',
                    'Select the model name you pulled (e.g. llava, moondream, or bakllava) from the model dropdown.',
                    'Click "Save Settings".',
                ],
            },
            {
                heading: 'Configuring Google Gemini',
                items: [
                    'Get a free API key from Google AI Studio (makersuite.google.com).',
                    'Select "Google Gemini" as the AI Service.',
                    'Paste your API key into the "API Key" field.',
                    'Choose a model (e.g. gemini-1.5-flash) from the dropdown.',
                    'Click "Save Settings".',
                ],
            },
            {
                heading: 'Configuring OpenAI',
                items: [
                    'Get an API key from platform.openai.com.',
                    'Select "OpenAI" as the AI Service.',
                    'Paste your API key into the "API Key" field and optionally set a custom base URL for proxies.',
                    'Select a model (e.g. gpt-4o) from the dropdown.',
                    'Click "Save Settings".',
                ],
            },
            {
                heading: 'Running AI analysis',
                items: [
                    'Once a provider is configured, open Settings → "AI Settings" and click "Analyse All Images" to kick off a batch job.',
                    'Alternatively, open any image in the preview and click the "AI Analyse" button to analyse just that image.',
                    'Progress is reported in real time via the notification bell.',
                ],
            },
        ],
        tip: 'Ollama is the best choice for privacy — everything runs on your own machine with no API costs.',
    },
    {
        id: 'timeline',
        icon: '🗂️',
        color: 'green',
        title: 'How to use Timeline view',
        shortTitle: 'Timeline view',
        steps: [
            {
                heading: 'Navigating to Timeline view',
                items: [
                    'After logging in, click "Timeline" in the top navigation bar. This is the default landing view.',
                    'Photos are grouped chronologically by month and year, with the most recent at the top.',
                ],
            },
            {
                heading: 'Using the timeline slider',
                items: [
                    'A vertical scrubber slider sits on the right side of the screen.',
                    'Drag the slider handle up or down to jump quickly between time periods without scrolling.',
                    'The current date label updates as you drag, giving you a fast preview of where you are in the timeline.',
                ],
            },
            {
                heading: 'Searching and filtering',
                items: [
                    'Use the search bar at the top to search across AI-generated descriptions, filenames, and tags.',
                    'Results filter live as you type.',
                    'Click any tag badge on a photo to filter the timeline to that tag only.',
                ],
            },
            {
                heading: 'Opening an image',
                items: [
                    'Click any thumbnail to open the full image preview panel on the right.',
                    'The preview shows the image, its AI description, tags, filename, date, and size.',
                    'Use the left/right arrow buttons or keyboard arrow keys to navigate between images.',
                    'Click the ⛶ expand icon to enter fullscreen mode with zoom controls.',
                ],
            },
        ],
        tip: 'Switch between light and dark themes using the moon/sun toggle in the top bar.',
    },
    {
        id: 'gallery',
        icon: '🖼️',
        color: 'blue',
        title: 'How to use Gallery view with sort and filters',
        shortTitle: 'Gallery view',
        steps: [
            {
                heading: 'Opening Gallery view',
                items: [
                    'Click "Gallery" in the top navigation bar.',
                    'Images are displayed in a responsive grid with infinite scroll — scroll down to load more.',
                ],
            },
            {
                heading: 'Sorting images',
                items: [
                    'Click the "Sort" dropdown in the toolbar.',
                    'Options: Date (newest first), Date (oldest first), File Size (largest), File Size (smallest), Filename (A–Z).',
                    'The gallery re-renders immediately with the new sort order.',
                ],
            },
            {
                heading: 'Filtering images',
                items: [
                    'Filter by Folder: select one or more monitored folders from the folder dropdown.',
                    'Filter by Tag: click a tag chip to show only images with that AI-generated tag. Click again to deselect.',
                    'Filter by Date Range: set a start and end date to limit to a time window.',
                    'Multiple filters combine with AND logic.',
                    'Click "Clear Filters" to reset everything.',
                ],
            },
            {
                heading: 'Searching',
                items: [
                    'Use the search bar to search by description, filename, or tag text.',
                    'The gallery updates live as you type.',
                ],
            },
        ],
        tip: 'Combine a tag filter with a date range to quickly find, for example, all "sunset" photos from last summer.',
    },
    {
        id: 'ai-single',
        icon: '🔬',
        color: 'orange',
        title: 'How to run AI analysis on a single image',
        shortTitle: 'AI image analysis',
        steps: [
            {
                heading: 'Prerequisites',
                items: [
                    'Make sure you have configured an AI provider first. Open Settings → "AI Settings" and set up Ollama, Google Gemini, or OpenAI.',
                    'Confirm at least one folder has been added and scanned so images appear in the Timeline or Gallery.',
                ],
            },
            {
                heading: 'Triggering analysis from the image preview panel',
                items: [
                    'Open the Timeline or Gallery view.',
                    'Click any image thumbnail to open the image preview panel on the right side.',
                    'Locate the "AI Analyse" button in the preview panel toolbar.',
                    'Click "AI Analyse". Pycasa sends the image to your configured AI provider.',
                    'Wait a few seconds — the AI description and tags will appear in the preview panel once processing is complete.',
                    'The notification bell in the top bar will also show a completion update.',
                ],
            },
            {
                heading: 'Triggering analysis from fullscreen mode',
                items: [
                    'Click the ⛶ expand icon on any image to enter fullscreen mode.',
                    'The "AI Analyse" button is also available in the fullscreen toolbar.',
                    'Click it and the analysis runs in the background — the description and tags update automatically when ready.',
                ],
            },
            {
                heading: 'Viewing the results',
                items: [
                    'After analysis, the image preview panel shows the AI-generated description and a list of tag badges.',
                    'Tags are also searchable — use the search bar or tag filter in Gallery/Timeline to find images by these tags.',
                    'Re-running "AI Analyse" on the same image overwrites the previous description and tags.',
                ],
            },
        ],
        tip: 'Single-image analysis is great for quickly testing your AI configuration or refreshing the description of a specific photo without waiting for a full batch run.',
    },
    {
        id: 'ai-batch',
        icon: '⚡',
        color: 'pink',
        title: 'How to run AI analysis in batch for all images',
        shortTitle: 'AI batch analysis',
        steps: [
            {
                heading: 'Prerequisites',
                items: [
                    'Configure an AI provider under Settings → "AI Settings" before starting. See the "AI settings" guide for setup steps.',
                    'Ensure your images have been indexed — run a folder scan first if you have just added folders.',
                    'For Ollama, make sure the Ollama service is running on your machine before starting the batch job.',
                ],
            },
            {
                heading: 'Starting the batch job',
                items: [
                    'Click the ⚙️ Settings icon in the top navigation bar.',
                    'Navigate to the "AI Settings" tab.',
                    'Click the "Analyse All Images" button.',
                    'Pycasa kicks off a background job that processes every image in the database one by one.',
                    'The button becomes disabled while the job is running to prevent duplicate submissions.',
                ],
            },
            {
                heading: 'Monitoring progress',
                items: [
                    'Click the 🔔 notification bell in the top navigation bar to see real-time progress.',
                    'Each notification shows which image is currently being processed and an overall count.',
                    'A final "Analysis complete" notification appears when all images have been processed.',
                ],
            },
            {
                heading: 'After the batch job completes',
                items: [
                    'All images now have AI-generated descriptions and tags stored in the database.',
                    'Use the search bar in Timeline or Gallery to search by any word in those descriptions.',
                    'Use the tag filter to browse images by AI-generated tags (e.g. "sunset", "dog", "beach").',
                    'Re-running "Analyse All Images" will overwrite existing descriptions and tags for every image.',
                ],
            },
        ],
        tip: 'Batch analysis can take a while depending on your library size and AI provider speed. Ollama on a modern GPU can process hundreds of images per hour. Leave Pycasa running in the background — it will work through the queue automatically.',
    },
    {
        id: 'rescan',
        icon: '🔄',
        color: 'yellow',
        title: 'How to rescan folders',
        shortTitle: 'Rescan folders',
        steps: [
            {
                heading: 'Manual rescan',
                items: [
                    'Open Settings and go to the "Scan Images" tab.',
                    'Click the 🔄 Rescan button next to the folder you want to re-index.',
                    'Pycasa walks the folder recursively, picks up new images, and updates existing records.',
                    'Watch the notification bell for live progress.',
                ],
            },
            {
                heading: 'Rescan all folders at once',
                items: [
                    'Click "Rescan All Folders" at the top of the "Scan Images" tab.',
                    'This triggers a background scan of every monitored folder in sequence.',
                    'New images appear in Timeline and Gallery once the scan completes.',
                ],
            },
            {
                heading: 'When to rescan',
                items: [
                    'After adding new photos to a monitored folder outside of Pycasa.',
                    'After editing or moving images on disk.',
                    'After restoring photos from a backup.',
                    'If thumbnails or metadata appear stale.',
                ],
            },
        ],
        tip: 'Pycasa does not watch folders for changes in real time. Run a rescan any time you add or move files on disk.',
    },
];

const colorMap = {
    green: { bg: 'rgba(16,185,129,0.12)', accent: '#10B981', border: 'rgba(16,185,129,0.25)' },
    purple: { bg: 'rgba(139,92,246,0.12)', accent: '#8B5CF6', border: 'rgba(139,92,246,0.25)' },
    blue: { bg: 'rgba(59,130,246,0.12)', accent: '#3B82F6', border: 'rgba(59,130,246,0.25)' },
    teal: { bg: 'rgba(6,182,212,0.12)', accent: '#06B6D4', border: 'rgba(6,182,212,0.25)' },
    yellow: { bg: 'rgba(245,158,11,0.12)', accent: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
    orange: { bg: 'rgba(249,115,22,0.12)', accent: '#F97316', border: 'rgba(249,115,22,0.25)' },
    pink: { bg: 'rgba(236,72,153,0.12)', accent: '#EC4899', border: 'rgba(236,72,153,0.25)' },
};

/* ─────────────────────────────────────────────
   Page component — receives Navbar as a child slot
   so the shared nav renders at the top
───────────────────────────────────────────── */
export default function HowTosPage({ navbar }) {
    const [activeId, setActiveId] = useState(sections[0].id);
    const [menuOpen, setMenuOpen] = useState(false);
    const observerRef = useRef(null);

    /* Scrollspy */
    useEffect(() => {
        observerRef.current = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible.length > 0) setActiveId(visible[0].target.id);
            },
            { rootMargin: '-68px 0px -55% 0px', threshold: 0 }
        );
        sections.forEach(({ id }) => {
            const el = document.getElementById(id);
            if (el) observerRef.current.observe(el);
        });
        return () => observerRef.current?.disconnect();
    }, []);

    const scrollTo = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
        setMenuOpen(false);
    };

    const activeSec = sections.find((s) => s.id === activeId) || sections[0];

    return (
        <div className="ht-page">
            {/* Shared navbar passed from App */}
            {navbar}

            <div className="ht-layout">
                {/* ── LEFT SIDEBAR ── */}
                <aside className="ht-sidebar">
                    <p className="ht-sidebar-heading">How-To Guides</p>
                    <nav>
                        {sections.map((s) => {
                            const c = colorMap[s.color];
                            const isActive = activeId === s.id;
                            return (
                                <button
                                    key={s.id}
                                    className={`ht-nav-item${isActive ? ' ht-nav-item--active' : ''}`}
                                    style={
                                        isActive
                                            ? {
                                                  color: c.accent,
                                                  borderLeftColor: c.accent,
                                                  background: c.bg,
                                              }
                                            : {}
                                    }
                                    onClick={() => scrollTo(s.id)}
                                >
                                    <span className="ht-nav-icon">{s.icon}</span>
                                    <span>{s.shortTitle}</span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* ── MAIN CONTENT ── */}
                <main className="ht-main">
                    {/* Mobile nav selector */}
                    <div className="ht-mobile-nav">
                        <button
                            className="ht-mobile-trigger"
                            onClick={() => setMenuOpen((o) => !o)}
                        >
                            <span className="ht-mobile-trigger-label">
                                <span>{activeSec.icon}</span>
                                <span>{activeSec.shortTitle}</span>
                            </span>
                            <ChevronIcon open={menuOpen} />
                        </button>
                        {menuOpen && (
                            <div className="ht-mobile-menu">
                                {sections.map((s) => {
                                    const c = colorMap[s.color];
                                    const isActive = activeId === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            className={`ht-mobile-item${isActive ? ' ht-mobile-item--active' : ''}`}
                                            style={isActive ? { color: c.accent } : {}}
                                            onClick={() => scrollTo(s.id)}
                                        >
                                            <span>{s.icon}</span>
                                            <span>{s.shortTitle}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Page header */}
                    <div className="ht-header">
                        <h1 className="ht-title">How-To Guides</h1>
                        <p className="ht-subtitle">
                            Everything you need to get the most out of Pycasa — from adding folders
                            to running AI analysis.
                        </p>
                    </div>

                    {/* Sections */}
                    <div className="ht-sections">
                        {sections.map((sec) => {
                            const c = colorMap[sec.color];
                            return (
                                <section key={sec.id} id={sec.id} className="ht-section">
                                    <div className="ht-section-title-row">
                                        <div
                                            className="ht-section-icon"
                                            style={{
                                                background: c.bg,
                                                border: `1px solid ${c.border}`,
                                            }}
                                        >
                                            {sec.icon}
                                        </div>
                                        <h2 className="ht-section-title">{sec.title}</h2>
                                    </div>

                                    {sec.steps.map((block) => (
                                        <div key={block.heading} className="ht-block">
                                            <h3
                                                className="ht-block-heading"
                                                style={{ color: c.accent }}
                                            >
                                                {block.heading}
                                            </h3>
                                            <ol className="ht-steps-list">
                                                {block.items.map((item, i) => (
                                                    <li key={i} className="ht-step">
                                                        <span
                                                            className="ht-step-num"
                                                            style={{
                                                                background: c.bg,
                                                                border: `1px solid ${c.border}`,
                                                                color: c.accent,
                                                            }}
                                                        >
                                                            {i + 1}
                                                        </span>
                                                        <span className="ht-step-text">{item}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    ))}

                                    {sec.tip && (
                                        <div
                                            className="ht-tip"
                                            style={{ borderColor: c.border, background: c.bg }}
                                        >
                                            <span
                                                className="ht-tip-label"
                                                style={{ color: c.accent }}
                                            >
                                                💡 Tip
                                            </span>
                                            <p>{sec.tip}</p>
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                </main>
            </div>
        </div>
    );
}

function ChevronIcon({ open }) {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
                transition: 'transform .2s',
                transform: open ? 'rotate(180deg)' : 'none',
                flexShrink: 0,
            }}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}
