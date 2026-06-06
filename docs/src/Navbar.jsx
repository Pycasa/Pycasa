import { useState } from 'react';
import logo from './assets/logo.png';

export default function Navbar({ page, navScrolled, onHome, onHowTos }) {
    const [menuOpen, setMenuOpen] = useState(false);

    const goToSection = (id) => {
        setMenuOpen(false);
        if (page !== 'home') {
            onHome();
            setTimeout(
                () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }),
                80
            );
        }
    };

    const handleHowTos = () => {
        setMenuOpen(false);
        onHowTos();
    };
    const handleHome = () => {
        setMenuOpen(false);
        onHome();
    };

    return (
        <nav className={navScrolled ? 'scrolled' : ''}>
            <div className="nav-inner">
                {/* Logo */}
                <button className="nav-logo-btn" onClick={handleHome}>
                    <img src={logo} alt="Pycasa" />
                    <span className="nav-logo-name">Pycasa</span>
                </button>

                {/* Desktop links */}
                <div className="nav-links nav-links-desktop">
                    {page === 'home' ? (
                        <a href="#features" className="nav-link-maybe">
                            Features
                        </a>
                    ) : (
                        <button className="nav-link-maybe" onClick={() => goToSection('features')}>
                            Features
                        </button>
                    )}
                    {page === 'home' ? (
                        <a href="#ai" className="nav-link-maybe">
                            BYOAI
                        </a>
                    ) : (
                        <button className="nav-link-maybe" onClick={() => goToSection('ai')}>
                            BYOAI
                        </button>
                    )}
                    <button
                        className={`nav-link-maybe${page === 'howtos' ? ' nav-link-active' : ''}`}
                        onClick={handleHowTos}
                    >
                        How-To
                    </button>
                    <a
                        href="https://github.com/pycasa/pycasa"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nav-gh"
                    >
                        <GithubIcon />
                    </a>
                    {page === 'home' ? (
                        <a href="#install" className="nav-cta">
                            Download
                        </a>
                    ) : (
                        <button
                            className="nav-cta nav-cta-btn"
                            onClick={() => goToSection('install')}
                        >
                            Download
                        </button>
                    )}
                </div>

                {/* Mobile hamburger */}
                <button
                    className="nav-hamburger"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Toggle menu"
                    aria-expanded={menuOpen}
                >
                    {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
                </button>
            </div>

            {/* Mobile dropdown */}
            {menuOpen && (
                <div className="nav-mobile-menu">
                    {page === 'home' ? (
                        <a
                            href="#features"
                            className="nav-mobile-item"
                            onClick={() => setMenuOpen(false)}
                        >
                            Features
                        </a>
                    ) : (
                        <button className="nav-mobile-item" onClick={() => goToSection('features')}>
                            Features
                        </button>
                    )}
                    {page === 'home' ? (
                        <a
                            href="#ai"
                            className="nav-mobile-item"
                            onClick={() => setMenuOpen(false)}
                        >
                            BYOAI
                        </a>
                    ) : (
                        <button className="nav-mobile-item" onClick={() => goToSection('ai')}>
                            BYOAI
                        </button>
                    )}
                    <button
                        className={`nav-mobile-item${page === 'howtos' ? ' nav-mobile-item--active' : ''}`}
                        onClick={handleHowTos}
                    >
                        How-To
                    </button>
                    <a
                        href="https://github.com/pycasa/pycasa"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nav-mobile-item"
                        onClick={() => setMenuOpen(false)}
                    ></a>
                    {page === 'home' ? (
                        <a
                            href="#install"
                            className="nav-mobile-item nav-mobile-cta"
                            onClick={() => setMenuOpen(false)}
                        >
                            Download
                        </a>
                    ) : (
                        <button
                            className="nav-mobile-item nav-mobile-cta"
                            onClick={() => goToSection('install')}
                        >
                            Download
                        </button>
                    )}
                </div>
            )}
        </nav>
    );
}

function GithubIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
    );
}

function HamburgerIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}
