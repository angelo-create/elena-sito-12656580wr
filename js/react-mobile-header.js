// React Mobile Header Component (wrapped in IIFE to avoid conflicts)
(function() {
    const { useState, useEffect } = React;

    const MobileHeader = () => {
        const [isOpen, setIsOpen] = useState(false);
        const [isScrolled, setIsScrolled] = useState(false);
        const [activeDropdown, setActiveDropdown] = useState(null);

        useEffect(() => {
            const handleScroll = () => {
                const hero = document.querySelector('.hero');
                if (hero) {
                    setIsScrolled(window.scrollY > hero.offsetHeight - 100);
                }
            };

            window.addEventListener('scroll', handleScroll);
            handleScroll();

            return () => window.removeEventListener('scroll', handleScroll);
        }, []);

        useEffect(() => {
            document.body.style.overflow = isOpen ? 'hidden' : '';
        }, [isOpen]);

        const toggleMenu = () => setIsOpen(!isOpen);
        const closeMenu = () => {
            setIsOpen(false);
            setActiveDropdown(null);
        };

        const toggleDropdown = (name) => {
            setActiveDropdown(activeDropdown === name ? null : name);
        };

        const menuItems = [
            { href: 'chi-sono.html', label: 'Chi Sono' },
            { href: 'metodo.html', label: 'Metodo' },
            { href: 'risultati.html', label: 'Risultati' },
            {
                label: 'Risorse',
                dropdown: [
                    { href: 'libri.html', label: 'Libri' },
                    { href: 'eventi.html', label: 'Eventi' },
                    { href: 'risorse-gratuite.html', label: 'Risorse Gratuite' },
                    { href: 'shop.html', label: 'Shop' }
                ]
            },
            {
                label: 'Per Aziende',
                dropdown: [
                    { href: 'partner.html', label: 'Diventa Partner' },
                    { href: 'press.html', label: 'Press & Media' },
                    { href: 'team.html', label: 'Team Medico' }
                ]
            }
        ];

        return React.createElement('div', { className: 'react-mobile-header' },
            // Header Bar
            React.createElement('header', {
                className: `rmh-bar ${isScrolled ? 'scrolled' : ''} ${isOpen ? 'menu-open' : ''}`
            },
                // Logo
                React.createElement('a', {
                    href: 'index.html',
                    className: 'rmh-logo'
                }, 'ELENA GIORDANI'),

                // Hamburger Button
                React.createElement('button', {
                    className: `rmh-hamburger ${isOpen ? 'active' : ''}`,
                    onClick: toggleMenu,
                    'aria-label': 'Menu'
                },
                    React.createElement('span', { className: 'rmh-hamburger-line' }),
                    React.createElement('span', { className: 'rmh-hamburger-line' }),
                    React.createElement('span', { className: 'rmh-hamburger-line' })
                )
            ),

            // Fullscreen Menu
            React.createElement('div', {
                className: `rmh-menu ${isOpen ? 'active' : ''}`
            },
                // Menu Background Effect
                React.createElement('div', { className: 'rmh-menu-bg' }),

                // Menu Content
                React.createElement('nav', { className: 'rmh-menu-content' },
                    menuItems.map((item, index) =>
                        item.dropdown
                            ? React.createElement('div', {
                                key: index,
                                className: `rmh-dropdown ${activeDropdown === item.label ? 'active' : ''}`,
                                style: { '--delay': `${0.1 + index * 0.05}s` }
                            },
                                React.createElement('button', {
                                    className: 'rmh-dropdown-toggle',
                                    onClick: () => toggleDropdown(item.label)
                                },
                                    item.label,
                                    React.createElement('span', { className: 'rmh-dropdown-arrow' }, '▾')
                                ),
                                React.createElement('div', { className: 'rmh-dropdown-menu' },
                                    item.dropdown.map((subItem, subIndex) =>
                                        React.createElement('a', {
                                            key: subIndex,
                                            href: subItem.href,
                                            onClick: closeMenu,
                                            style: { '--sub-delay': `${subIndex * 0.05}s` }
                                        }, subItem.label)
                                    )
                                )
                            )
                            : React.createElement('a', {
                                key: index,
                                href: item.href,
                                className: 'rmh-link',
                                onClick: closeMenu,
                                style: { '--delay': `${0.1 + index * 0.05}s` }
                            }, item.label)
                    ),

                    // CTA Button
                    React.createElement('a', {
                        href: 'contatti.html',
                        className: 'rmh-cta',
                        onClick: closeMenu,
                        style: { '--delay': '0.4s' }
                    }, 'Candidati')
                )
            )
        );
    };

    // Mount only on mobile
    const mountReactHeader = () => {
        const container = document.getElementById('react-mobile-header-root');
        if (container && window.innerWidth <= 768) {
            const root = ReactDOM.createRoot(container);
            root.render(React.createElement(MobileHeader));
        }
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountReactHeader);
    } else {
        mountReactHeader();
    }

    // Re-mount on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const container = document.getElementById('react-mobile-header-root');
            if (container) {
                if (window.innerWidth <= 768) {
                    mountReactHeader();
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }
            }
        }, 100);
    });
})();
