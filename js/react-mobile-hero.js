// React Mobile Hero Component (wrapped in IIFE to avoid conflicts)
(function() {
    const { useState, useEffect, useRef } = React;

    // Animated Counter Component
    const AnimatedCounter = ({ end, suffix = '', duration = 2000 }) => {
        const [count, setCount] = useState(0);
        const [isVisible, setIsVisible] = useState(false);
        const ref = useRef(null);

        useEffect(() => {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                    }
                },
                { threshold: 0.5 }
            );

            if (ref.current) observer.observe(ref.current);
            return () => observer.disconnect();
        }, []);

        useEffect(() => {
            if (!isVisible) return;

            let startTime;
            const animate = (currentTime) => {
                if (!startTime) startTime = currentTime;
                const progress = Math.min((currentTime - startTime) / duration, 1);

                // Easing function
                const easeOut = 1 - Math.pow(1 - progress, 3);
                setCount(Math.floor(easeOut * end));

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };

            requestAnimationFrame(animate);
        }, [isVisible, end, duration]);

        return React.createElement('span', { ref }, count + suffix);
    };

    // Main Mobile Hero Component
    const MobileHero = () => {
        const [isLoaded, setIsLoaded] = useState(false);

        useEffect(() => {
            // Trigger animations after mount
            setTimeout(() => setIsLoaded(true), 100);
        }, []);

        const stats = [
            { number: 2300, suffix: '+', label: 'TRASFORMAZIONI' },
            { number: 8, suffix: '', label: 'PAESI' },
            { number: 100, suffix: '%', label: 'LIVE' }
        ];

        return React.createElement('div', {
            className: `rmh-hero ${isLoaded ? 'loaded' : ''}`
        },
            // Badge
            React.createElement('div', {
                className: 'rmh-hero-badge',
                style: { '--delay': '0.2s' }
            },
                React.createElement('span', { className: 'rmh-hero-badge-dot' }),
                'X-Fit Academy - 100% Live da Casa'
            ),

            // Title
            React.createElement('h1', { className: 'rmh-hero-title' },
                React.createElement('span', {
                    className: 'rmh-hero-title-line',
                    style: { '--delay': '0.3s' }
                }, 'Non e una dieta.'),
                React.createElement('span', {
                    className: 'rmh-hero-title-line',
                    style: { '--delay': '0.4s' }
                }, 'Non e un allenamento.'),
                React.createElement('span', {
                    className: 'rmh-hero-title-line accent',
                    style: { '--delay': '0.5s' }
                }, 'E un cambio di vita.')
            ),

            // Subtitle
            React.createElement('p', {
                className: 'rmh-hero-subtitle',
                style: { '--delay': '0.6s' }
            },
                'Il primo percorso in Italia dedicato esclusivamente alle donne. Allenamento, alimentazione e supporto emotivo. Perche si cambia dentro per cambiare fuori.'
            ),

            // Video
            React.createElement('div', {
                className: 'rmh-hero-video',
                style: { '--delay': '0.7s' }
            },
                React.createElement('div', { className: 'rmh-hero-video-glow' }),
                React.createElement('video', {
                    autoPlay: true,
                    muted: true,
                    loop: true,
                    playsInline: true,
                    controls: true
                },
                    React.createElement('source', {
                        src: 'https://res.cloudinary.com/dbuk5abrs/video/upload/v1767391460/68f9475cc3bfa481489d26b7_1_upgy0f.mp4',
                        type: 'video/mp4'
                    })
                )
            ),

            // CTA Buttons
            React.createElement('div', {
                className: 'rmh-hero-cta',
                style: { '--delay': '0.8s' }
            },
                React.createElement('a', {
                    href: '#percorsi',
                    className: 'rmh-hero-btn primary'
                },
                    'Scopri i Percorsi',
                    React.createElement('span', { className: 'rmh-hero-btn-arrow' }, '→')
                ),
                React.createElement('a', {
                    href: 'metodo.html',
                    className: 'rmh-hero-btn secondary'
                }, 'Il Metodo E.A.S.Y.')
            ),

            // Stats
            React.createElement('div', {
                className: 'rmh-hero-stats',
                style: { '--delay': '0.9s' }
            },
                stats.map((stat, index) =>
                    React.createElement('div', {
                        key: index,
                        className: 'rmh-hero-stat',
                        style: { '--stat-delay': `${1 + index * 0.1}s` }
                    },
                        React.createElement('div', { className: 'rmh-hero-stat-number' },
                            React.createElement(AnimatedCounter, {
                                end: stat.number,
                                suffix: stat.suffix,
                                duration: 1500
                            })
                        ),
                        React.createElement('div', { className: 'rmh-hero-stat-label' }, stat.label)
                    )
                )
            )
        );
    };

    // Mount only on mobile
    const mountReactHero = () => {
        const container = document.getElementById('react-mobile-hero-root');
        if (container && window.innerWidth <= 768) {
            const root = ReactDOM.createRoot(container);
            root.render(React.createElement(MobileHero));
            container.style.display = 'block';

            // Hide original hero content on mobile
            const originalHeroContent = document.querySelector('.hero-content');
            if (originalHeroContent) {
                originalHeroContent.style.display = 'none';
            }
        }
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountReactHero);
    } else {
        mountReactHero();
    }

    // Handle resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const container = document.getElementById('react-mobile-hero-root');
            const originalHeroContent = document.querySelector('.hero-content');

            if (window.innerWidth <= 768) {
                if (container) {
                    container.style.display = 'block';
                    mountReactHero();
                }
                if (originalHeroContent) {
                    originalHeroContent.style.display = 'none';
                }
            } else {
                if (container) {
                    container.style.display = 'none';
                }
                if (originalHeroContent) {
                    originalHeroContent.style.display = '';
                }
            }
        }, 100);
    });
})();
