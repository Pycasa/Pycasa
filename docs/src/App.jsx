import { useState, useEffect, useRef } from 'react';
import logo from './assets/logo.png';

const screenshots = [
  {
    id: 'timeline',
    label: 'Timeline',
    src: './pycasa1.png',
    title: 'Pycasa — Chronological Timeline View',
  },
  {
    id: 'gallery',
    label: 'Gallery',
    src: './pycasa2.png',
    title: 'Pycasa — Grid Gallery with Filters',
  },
  {
    id: 'ai-tags',
    label: 'AI Tags',
    src: './pycasa3.png',
    title: 'Pycasa — AI-Generated Descriptions & Tags',
  },
  {
    id: 'detail',
    label: 'Image Detail',
    src: './pycasa4.png',
    title: 'Pycasa — Image Detail Modal',
  },
  {
    id: 'settings',
    label: 'Settings',
    src: './pycasa5.png',
    title: 'Pycasa — AI & Folder Settings',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    src: './pycasa6.png',
    title: 'Pycasa — Real-time Notifications',
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
  docker: {
    comment: '# Run with Docker. Get your GitHub token from https://github.com/settings/tokens',
    cmd: 'echo <GITHUB_TOKEN> | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin; docker run -d -p 8080:8080 -v ~/Pictures:/photos --name pycasa ghcr.io/Pycasa/pycasa:latest',
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
  const [activeTab, setActiveTab] = useState('jar');
  const [activeScreenshot, setActiveScreenshot] = useState('timeline');
  const [copied, setCopied] = useState(false);
  const [ssPaused, setSsPaused] = useState(false);
  const [activeProvider, setActiveProvider] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installCommands[activeTab].cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentScreenshot = screenshots.find((s) => s.id === activeScreenshot) || screenshots[0];

  return (
    <div className="root-wrap">
      {/* Background glows */}
      <div className="glow glow-1" />
      <div className="glow glow-2" />

      {/* ── NAVIGATION ── */}
      <nav className={navScrolled ? 'scrolled' : ''}>
        <div className="nav-inner">
          <a href="#" className="nav-logo">
            <img src={logo} alt="Pycasa" />
            <span className="nav-logo-name">Pycasa</span>
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            {/* <a href="#demo">Screenshots</a> */}
            <a href="#ai">AI Setup</a>
            <a href="#install">Install</a>
            <a
              href="https://github.com/pycasa/pycasa"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-gh"
            >
              <GithubIcon />
              GitHub
            </a>
            <a href="#install" className="nav-cta">Get Started</a>
          </div>
        </div>
      </nav>

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
            <DownloadIcon /> Get Started Free
          </a>
          <a
            href="https://github.com/pycasa/pycasa"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <GithubIcon /> Star on GitHub
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
            <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
            <span className="demo-bar-title">pycasa — {currentScreenshot.title}</span>
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

      {/* ── AI SETUP ── */}
      <section id="ai" className="section-ai">
        <h2 className="section-title">Flexible AI — your choice</h2>
        <p className="section-sub">
          Run AI locally with Ollama, or connect to Gemini or OpenAI. You decide what runs where.
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
            { label: 'Backend', items: ['Quarkus 3.6 (Java 17)', 'Couchbase Lite', 'Ollama4j', 'Tess4J (OCR)', 'WebSockets'] },
            { label: 'Frontend', items: ['React 18 + Vite 5', 'Tailwind CSS', 'shadcn/ui', 'React Router v6', 'Framer Motion'] },
            { label: 'Build & Deploy', items: ['Quarkus Quinoa', 'Single uber-JAR', 'Docker support', 'Maven 3.8+', 'Makefile'] },
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
              {Object.entries({ jar: 'Executable JAR', docker: 'Docker', build: 'Build Source' }).map(([k, label]) => (
                <button
                  key={k}
                  className={`t-tab ${activeTab === k ? 'active' : ''}`}
                  onClick={() => setActiveTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="copy-btn" onClick={copyToClipboard} title="Copy">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <div className="terminal-body">
            <div className="t-comment">{installCommands[activeTab].comment}</div>
            <div className="t-line">
              <span className="t-prompt">$</span>
              <span className="t-cmd">{installCommands[activeTab].cmd}</span>
            </div>
          </div>
        </div>

        <div className="prereqs">
          <h3>Prerequisites</h3>
          <div className="prereq-grid">
            {[
              { name: 'Java', version: '17+', required: true },
              { name: 'Maven', version: '3.8+', required: false, note: 'build only' },
              { name: 'Node.js', version: '18+', required: false, note: 'build only' },
              { name: 'Ollama', version: 'any', required: false, note: 'optional, for AI' },
            ].map((p) => (
              <div key={p.name} className="prereq-item">
                <span className="prereq-name">{p.name}</span>
                <span className="prereq-version">{p.version}</span>
                {p.note && <span className="prereq-note">{p.note}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="default-creds">
          <span className="creds-icon">🔑</span>
          <div>
            <strong>Default login:</strong> username <code>admin</code> · password <code>admin</code>
            <span className="creds-note"> — change this after first login</span>
          </div>
        </div>
      </section>

      {/* ── API REFERENCE ── */}
      <section className="section-api">
        <h2 className="section-title">REST API</h2>
        <p className="section-sub">
          Full Swagger UI available at <code>/docs</code> when the server is running.
        </p>
        <div className="api-table-wrap">
          <table className="api-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['GET', '/api/health', 'Health check'],
                ['POST', '/api/auth/login', 'Login'],
                ['GET', '/api/folders', 'List monitored folders'],
                ['POST', '/api/folders', 'Add a folder'],
                ['GET', '/api/images', 'List images (paginated, filterable)'],
                ['POST', '/api/images/scan', 'Trigger a folder scan'],
                ['GET', '/api/images/tags', 'List all AI-generated tags'],
                ['POST', '/api/ai/batch-analyse', 'Run AI analysis on all images'],
                ['GET', '/api/ai/analysis-status', 'AI analysis progress'],
                ['GET', '/api/settings', 'Get app settings'],
                ['POST', '/api/settings', 'Update settings'],
              ].map(([method, path, desc]) => (
                <tr key={path}>
                  <td><span className={`method method-${method.toLowerCase()}`}>{method}</span></td>
                  <td><code>{path}</code></td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
