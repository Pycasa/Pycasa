import { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import Navbar from './Navbar.jsx';
import HowTosPage from './HowTos.jsx';

const screenshots = [
  {
    id: 'timeline-light-slider',
    label: 'Timeline View',
    src: './screenshots/timeline-light-slider.png',
    title: 'Timeline View with slider for fast image browsing by time - Just like in Google Photos',
  },
  {
    id: 'gallery-light',
    label: 'Gallery View',
    src: './screenshots/gallery-light.png',
    title: 'View images in a grid layout - Classic Photo Gallery',
  },
  {
    id: 'ai-analysis-image-preview',
    label: 'AI Image Analysis',
    src: './screenshots/ai-analysis-image-preview.png',
    title: 'Clicking on the "AI Analyse" button triggers AI-powered image analysis and adds description and tags to the image',
  },
  {
    id: 'image-preview-fullscreen',
    label: 'Fullscreen Preview',
    src: './screenshots/image-preview-fullscreen.png',
    title: 'Image Preview Fullscreen with zoom in and zoom out controls and to reset view',
  },
  {
    id: 'timeline-dark',
    label: 'Dark Mode',
    src: './screenshots/timeline-dark.png',
    title: 'Switch between light and dark themes',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    src: './screenshots/notifications.png',
    title: 'Get real-time notifications about the status of scan and AI analysis',
  },
  {
    id: 'settings-scan-images',
    label: 'Scan Image Folders',
    src: './screenshots/settings-scan-images.png',
    title: 'Settings for Scanning Images from Multiple Folders - Configure folders to scan for images',
  },
  {
    id: 'ai-service-select',
    label: 'AI Service Selection',
    src: './screenshots/ai-service-select.png',
    title: 'Select the AI service you would like to use for running image analysis. Ollama or Google Gemini.',
  },
  {
    id: 'ai-service-ollama',
    label: 'Ollama as AI service',
    src: './screenshots/ai-service-ollama.png',
    title: 'Configure Ollama as an AI service - Ollama is a free, open-source AI platform that allows you to run large language models on your own computer.',
  },
  {
    id: 'ai-service-gemini-openai',
    label: 'Google Gemini or OpenAI',
    src: './screenshots/ai-service-gemini-openai.png',
    title: 'Configure Google Gemini or OpenAI as an AI service.',
  },
  {
    id: 'settings-ocr',
    label: 'OCR Settings',
    src: './screenshots/settings-ocr.png',
    title: 'Configure OCR - Uses Tesseract OCR for extracting text from images',
  },



  {
    id: 'ai-analysis-trigger',
    label: 'Trigger Analysis on All Images',
    src: './screenshots/ai-analysis-trigger.png',
    title: 'Trigger Analysis on All Images. Starts a background job to analyze all images in the database.',
  },
    {
    id: 'login',
    label: 'Login',
    src: './screenshots/login.png',
    title: 'Login',
  },
];

const features = [
  {
    icon: '🗂️',
    color: 'green',
    title: 'Timeline & Gallery Views',
    desc: 'Browse your photos chronologically grouped by month and year, or switch to a responsive grid gallery with infinite scroll.',
  },
  {
    icon: '🤖',
    color: 'purple',
    title: 'Local AI Analysis',
    desc: 'Automatic descriptions and tags via Ollama — runs entirely on your machine. No API keys, no data leaving your network.',
  },
  {
    icon: '🔍',
    color: 'blue',
    title: 'Smart Search & Tag Filtering',
    desc: 'Find any photo instantly by description, filename, or AI-generated tags. Filter by folder, date, or multiple tags at once.',
  },
  {
    icon: '📁',
    color: 'teal',
    title: 'Folder Monitoring',
    desc: 'Point Pycasa at any folder on your machine. It recursively scans and indexes all images automatically in the background.',
  },
  {
    icon: '📡',
    color: 'yellow',
    title: 'Real-time Notifications',
    desc: 'WebSocket-powered live updates for scan and AI analysis progress. See exactly what\'s happening as it happens.',
  },
  {
    icon: '🗄️',
    color: 'orange',
    title: 'Zero-Config Database',
    desc: 'Powered by Couchbase Lite — an embedded NoSQL database. No external database to install, configure, or maintain.',
  },
  {
    icon: '📦',
    color: 'teal',
    title: 'Single Binary Deploy',
    desc: 'Ships as a self-contained JAR with the full React UI bundled inside. One file, one command, done.',
  },
  {
    icon: '🌙',
    color: 'purple',
    title: 'Dark Mode',
    desc: 'Full dark and light theme support with smooth transitions. Your eyes will thank you during late-night photo sessions.',
  },
  {
    icon: '🔒',
    color: 'blue',
    title: '100% Private',
    desc: 'Everything runs on your own hardware. Your photos never leave your machine. No subscriptions, no cloud, no tracking.',
  },
];

const installCommands = {
  jar: {
    comment: '# One-liner install — requires Java 17+',
    cmd: 'curl -fsSL https://raw.githubusercontent.com/Pycasa/Pycasa/main/install.sh | bash',
  },
  // gh_docker: {
  //   comment: '# Run with Docker. Get your GitHub token from https://github.com/settings/tokens',
  //   cmd: 'echo <GITHUB_TOKEN> | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin; docker run -d -p 8080:8080 -v ~/Pictures:/photos --name pycasa ghcr.io/Pycasa/pycasa:latest',
  // },
  docker: {
    cmd: 'docker run -d -p 8080:8080 -v ~/Pictures:/photos pycasa/pycasa:latest'
  },
  build: {
    comment: '# Build from source',
    cmd: 'git clone https://github.com/Pycasa/Pycasa.git && cd Pycasa && make build && java -jar target/pycasa-server-*-runner.jar',
  },
};

const aiProviders = [
  {
    name: 'Ollama',
    badge: 'Recommended',
    badgeColor: 'green',
    desc: 'Run vision models like LLaVA, Moondream, or BakLLaVA entirely on your machine. Zero cost, zero cloud.',
    steps: [
      'Install Ollama from ollama.com',
      'Pull a vision model: ollama pull llava',
      'Set the Ollama URL in Pycasa Settings',
      'Run batch analysis — done!',
    ],
  },
  {
    name: 'Google Gemini',
    badge: 'Cloud',
    badgeColor: 'blue',
    desc: 'Use Google\'s Gemini Vision API for high-quality image analysis. Requires an API key from Google AI Studio.',
    steps: [
      'Get an API key from makersuite.google.com',
      'Enter the key in Pycasa AI Settings',
      'Select Gemini as your AI provider',
      'Run batch analysis',
    ],
  },
  {
    name: 'OpenAI GPT-4',
    badge: 'Cloud',
    badgeColor: 'blue',
    desc: 'Use OpenAI\'s GPT-4 Vision for industry-leading image understanding. Requires an OpenAI API key.',
    steps: [
      'Get an API key from platform.openai.com',
      'Enter the key in Pycasa AI Settings',
      'Select OpenAI as your AI provider',
      'Run batch analysis',
    ],
  },
];

export default function App() {
  const [page, setPage] = useState('home');
  const [activeTab, setActiveTab] = useState('windows');
  const [activeScreenshot, setActiveScreenshot] = useState('timeline');
  const [copied, setCopied] = useState(false);
  const [ssPaused, setSsPaused] = useState(false);
  const [activeProvider, setActiveProvider] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [latestVersion, setLatestVersion] = useState('v0.0.2'); // fallback

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch latest GitHub release version
  useEffect(() => {
    fetch('https://api.github.com/repos/Pycasa/Pycasa/releases/latest')
      .then((r) => r.json())
      .then((data) => { if (data.tag_name) setLatestVersion(data.tag_name); })
      .catch(() => {}); // keep fallback on error
  }, []);

  // Auto-play screenshots
  useEffect(() => {
    if (ssPaused) return;
    const interval = setInterval(() => {
      setActiveScreenshot((prev) => {
        const idx = screenshots.findIndex((s) => s.id === prev);
        return screenshots[(idx + 1) % screenshots.length].id;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [ssPaused]);

  const goToHowTos = () => { setPage('howtos'); window.scrollTo(0, 0); };
  const goHome = () => { setPage('home'); window.scrollTo(0, 0); };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installCommands[activeTab].cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentScreenshot = screenshots.find((s) => s.id === activeScreenshot) || screenshots[0];

  const sharedNav = (
    <Navbar
      page={page}
      navScrolled={navScrolled}
      onHome={goHome}
      onHowTos={goToHowTos}
    />
  );

  /* ── HOW-TO PAGE ── full separate layout ── */
  if (page === 'howtos') {
    return (
      <div className="root-wrap">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <HowTosPage navbar={sharedNav} />
      </div>
    );
  }

  return (
    <div className="root-wrap">
      {/* Background glows */}
      <div className="glow glow-1" />
      <div className="glow glow-2" />

      {sharedNav}

      {/* ── HOME PAGE CONTENT ── */}
      <div>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-dot" />
          Self-hosted · Local AI · No cloud required
        </div>
        <h1>
          Your photos, your server,{' '}
          <span className="gradient-text">your rules.</span>
        </h1>
        <p className="hero-sub">
          Pycasa is a self-hosted photo manager that runs entirely on your own machine.
          Point it at your photo folders and get a fast, searchable gallery with
          AI-powered descriptions and tags — all processed locally.
        </p>
        <div className="hero-ctas">
          <a href="#install" className="btn-primary">
            <DownloadIcon /> Download
          </a>
          <a
            href="https://github.com/pycasa/pycasa"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <GithubIcon /> Star on GitHub
          </a>
          <a
            href="https://www.producthunt.com/products/pycasa?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-pycasa"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ph"
          >
            <img
              alt="Pycasa - A self-hosted modern AI photo manager | Product Hunt"
              width="250"
              height="54"
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1157300&amp;theme=neutral&amp;t=1780044878636"
            />
          </a>
        </div>
        <div className="hero-pills">
          <span className="pill">🔒 100% Private</span>
          <span className="pill">⚡ Quarkus + React</span>
          <span className="pill">🤖 Ollama / Gemini / OpenAI</span>
          <span className="pill">📦 Single JAR</span>
        </div>
      </section>

      {/* ── SCREENSHOTS ── */}
      <section id="demo" className="section-demo">
        <h2 className="section-title">See Pycasa in Action</h2>
        <p className="section-sub">
          A clean, fast interface for your entire photo library — with AI superpowers.
        </p>

        <div className="ss-tabs">
          {screenshots.map((s) => (
            <button
              key={s.id}
              className={`ss-tab ${activeScreenshot === s.id ? 'active' : ''}`}
              onClick={() => { setActiveScreenshot(s.id); setSsPaused(true); }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="demo-frame">
          <div className="demo-bar">
            {/* <span className="dot red" /><span className="dot yellow" /><span className="dot green" /> */}
            <span className="demo-bar-title">{currentScreenshot.title}</span>
          </div>
          <div className="demo-img-wrap">
            <img
              key={currentScreenshot.id}
              src={currentScreenshot.src}
              alt={currentScreenshot.title}
              className="demo-img"
            />
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="section-features">
        <h2 className="section-title">Everything you need</h2>
        <p className="section-sub">
          Built for people who care about privacy and want a great photo experience without the cloud.
        </p>
        <div className="features-grid">
          {features.map((f) => (
            <div key={f.title} className="feature-card">
              <div className={`feature-icon ${f.color}`}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section-how">
        <h2 className="section-title">How it works</h2>
        <p className="section-sub">Simple by design. Powerful under the hood.</p>
        <div className="steps">
          {[
            { n: '01', title: 'Add your folders', desc: 'Point Pycasa at any folder on your machine. Use the built-in filesystem browser or type the path directly.' },
            { n: '02', title: 'Pycasa scans & indexes', desc: 'A background scan walks your folders recursively, indexing every image into the embedded Couchbase Lite database.' },
            { n: '03', title: 'AI analyses your photos', desc: 'Trigger batch analysis and your local Ollama instance (or cloud AI) generates rich descriptions and tags for every image.' },
            { n: '04', title: 'Browse, search & discover', desc: 'Use the Timeline or Gallery view to browse. Search by description, filter by tags, sort by date or size — instantly.' },
          ].map((step) => (
            <div key={step.n} className="step">
              <div className="step-num">{step.n}</div>
              <div className="step-body">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── BYOAI ── */}
      <section id="ai" className="section-ai">
        <h2 className="section-title">Bring Your Own AI</h2>
        <p className="section-sub">
          Flexible AI - Run AI locally with Ollama, or connect to Gemini or OpenAI. You decide what runs where.
        </p>
        <div className="ai-providers">
          <div className="ai-tabs">
            {aiProviders.map((p, i) => (
              <button
                key={p.name}
                className={`ai-tab ${activeProvider === i ? 'active' : ''}`}
                onClick={() => setActiveProvider(i)}
              >
                {p.name}
                <span className={`ai-badge ${p.badgeColor}`}>{p.badge}</span>
              </button>
            ))}
          </div>
          <div className="ai-panel">
            <p className="ai-desc">{aiProviders[activeProvider].desc}</p>
            <ol className="ai-steps">
              {aiProviders[activeProvider].steps.map((s, i) => (
                <li key={i}>
                  <span className="ai-step-num">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            {activeProvider === 0 && (
              <div className="ai-code-block">
                <div className="code-header">
                  <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
                  <span className="code-label">Terminal</span>
                </div>
                <pre className="code-body">
                  <span className="code-comment"># Install Ollama and pull a vision model</span>{'\n'}
                  <span className="code-prompt">$</span> <span className="code-cmd">ollama pull llava</span>{'\n'}
                  <span className="code-prompt">$</span> <span className="code-cmd">ollama pull nomic-embed-text</span>{'\n'}
                  <span className="code-comment"># Then open Pycasa → Settings → AI Settings</span>
                </pre>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="section-stack">
        <h2 className="section-title">Built on solid foundations</h2>
        <p className="section-sub">Modern, proven technologies — nothing exotic.</p>
        <div className="stack-grid">
          {[
            { label: 'Backend', items: ['Quarkus 3.6 (Java 17)', 'Couchbase Lite', 'Ollama4j', 'Tess4J (OCR)'] },
            { label: 'Frontend', items: ['React 18 + Vite 5', 'Tailwind CSS', 'shadcn/ui','Framer Motion'] },
          ].map((col) => (
            <div key={col.label} className="stack-col">
              <h3 className="stack-label">{col.label}</h3>
              <ul className="stack-list">
                {col.items.map((item) => (
                  <li key={item}>
                    <span className="stack-dot" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── INSTALL ── */}
      <section id="install" className="section-install">
        <h2 className="section-title">Get up and running</h2>
        <p className="section-sub">
          Pycasa requires Java 17+. Ollama is optional but recommended for AI features.
        </p>

        <div className="terminal-box">
          <div className="terminal-header">
            <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
            <div className="terminal-tabs">
              {Object.entries({
                windows: 'Windows',
                jar: 'Executable JAR',
                docker: 'Docker',
                build: 'Build Source',
              }).map(([k, label]) => (
                <button
                  key={k}
                  className={`t-tab ${activeTab === k ? 'active' : ''}`}
                  onClick={() => setActiveTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {activeTab !== 'windows' && (
              <button className="copy-btn" onClick={copyToClipboard} title="Copy">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            )}
          </div>

          {activeTab === 'windows' ? (
            <div className="windows-download-body">
              <div className="windows-download-icon">
                <img src="./site-images/windows.png" alt="Windows" />
              </div>
              <div className="windows-download-info">
                <div className="windows-download-title">Pycasa for Windows</div>
                <div className="windows-download-version">
                  Latest release: <span className="windows-version-tag">{latestVersion}</span>
                </div>
                <div className="windows-download-note">
                  Windows 10 / 11 · 64-bit installer · Requires Java 17+
                </div>
              </div>
              <a
                href={`https://github.com/Pycasa/Pycasa/releases/download/${latestVersion}/PycasaSetup-${latestVersion}.exe`}
                className="windows-download-btn"
                download
              >
                <DownloadIcon /> Download .exe
              </a>
            </div>
          ) : (
            <div className="terminal-body">
              <div className="t-comment">{installCommands[activeTab].comment}</div>
              <div className="t-line">
                <span className="t-prompt">$</span>
                <span className="t-cmd">{installCommands[activeTab].cmd}</span>
              </div>
            </div>
          )}
        </div>

       

        <div className="default-creds">
          <div className="creds-row">
            <span className="creds-icon">🌐</span>
            <div className="creds-item">
              <span className="creds-label">Navigate to URL</span>
              <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" className="creds-value creds-link">
                http://localhost:3000
              </a>
            </div>
          </div>
          <div className="creds-divider" />
          <div className="creds-row">
            <span className="creds-icon">🔑</span>
            <div className="creds-item">
              <span className="creds-label">Default credentials</span>
              <span className="creds-value">
                Username: <code>admin</code> <span className="creds-sep"> Password: </span> <code>admin</code>
              </span>
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <div className="footer-inner">
          <div className="footer-brand">
            <img src={logo} alt="Pycasa" className="footer-logo" />
            <div>
              <div className="footer-name">Pycasa</div>
              <div className="footer-tagline">Your photos, your server, your rules.</div>
            </div>
          </div>
          <div className="footer-links">
            <a href="https://github.com/pycasa/pycasa" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://github.com/pycasa/pycasa/issues" target="_blank" rel="noopener noreferrer">Issues</a>
            <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a>
            <a href="https://quarkus.io" target="_blank" rel="noopener noreferrer">Quarkus</a>
          </div>
          <div className="footer-copy">
            © {new Date().getFullYear()} Pycasa · MIT License
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Inline SVG icons ── */
function GithubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
