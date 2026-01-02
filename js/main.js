/**
 * Elena Giordani - X-Fit Academy
 * Main JavaScript File
 * Version: 7.2
 */

// ===== MOBILE MENU =====
function toggleMobileMenu() {
    const hamburger = document.getElementById('navHamburger');
    const menu = document.getElementById('navMenu');
    hamburger.classList.toggle('active');
    menu.classList.toggle('active');
    document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
}

function closeMobileMenu() {
    const hamburger = document.getElementById('navHamburger');
    const menu = document.getElementById('navMenu');
    hamburger.classList.remove('active');
    menu.classList.remove('active');
    document.body.style.overflow = '';

    // Close all dropdowns
    document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
        dropdown.classList.remove('open');
    });
}

// ===== MOBILE DROPDOWN TOGGLE =====
function initMobileDropdowns() {
    const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');

    dropdownToggles.forEach(toggle => {
        // Use both click and touchend for better mobile support
        ['click', 'touchend'].forEach(eventType => {
            toggle.addEventListener(eventType, function(e) {
                // Only handle on mobile
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    e.stopPropagation();

                    const dropdown = this.closest('.nav-dropdown');

                    if (!dropdown) return;

                    // Close other dropdowns
                    document.querySelectorAll('.nav-dropdown').forEach(d => {
                        if (d !== dropdown) {
                            d.classList.remove('open');
                        }
                    });

                    // Toggle current dropdown
                    dropdown.classList.toggle('open');

                    console.log('Dropdown toggled:', dropdown.classList.contains('open'));
                }
            }, { passive: false });
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!e.target.closest('.nav-dropdown')) {
                document.querySelectorAll('.nav-dropdown').forEach(d => {
                    d.classList.remove('open');
                });
            }
        }
    });

    // Close dropdowns on window resize to desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            document.querySelectorAll('.nav-dropdown').forEach(d => {
                d.classList.remove('open');
            });
        }
    });
}

// ===== SMOOTH SCROLL =====
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if(target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// ===== NAVBAR SCROLL =====
function initNavbarScroll() {
    const nav = document.getElementById('navbar');
    const hero = document.querySelector('.hero');

    if (!nav || !hero) return;

    window.addEventListener('scroll', () => {
        if(window.scrollY > hero.offsetHeight - 100) {
            nav.classList.remove('dark');
        } else {
            nav.classList.add('dark');
        }
    });

    nav.classList.add('dark');
}

// ===== HORIZONTAL SCROLL (Method Section) =====
function initHorizontalScroll() {
    const methodScroll = document.querySelector('.method-scroll');
    if(methodScroll) {
        methodScroll.addEventListener('wheel', (e) => {
            if(e.deltaY !== 0) {
                e.preventDefault();
                methodScroll.scrollLeft += e.deltaY;
            }
        });
    }
}

// ===== MODAL FUNCTIONS =====
function openSpecialistModal(type) {
    const modal = document.getElementById('specialistModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSpecialistModal() {
    const modal = document.getElementById('specialistModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function initModalEvents() {
    const modal = document.getElementById('specialistModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if(e.target === this) {
                closeSpecialistModal();
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if(e.key === 'Escape') {
            closeSpecialistModal();
        }
    });
}

// ===== FAQ TOGGLE =====
function toggleFaq(element) {
    const faqItem = element.closest('.faq-item');
    const allItems = document.querySelectorAll('.faq-item');

    allItems.forEach(item => {
        if(item !== faqItem) {
            item.classList.remove('active');
        }
    });

    faqItem.classList.toggle('active');
}

// ===== PRESS LOGOS PAUSE ON HOVER =====
function initPressLogos() {
    const pressTrack = document.querySelector('.press-logos-track');
    if(pressTrack) {
        pressTrack.addEventListener('mouseenter', () => {
            pressTrack.style.animationPlayState = 'paused';
        });
        pressTrack.addEventListener('mouseleave', () => {
            pressTrack.style.animationPlayState = 'running';
        });
    }
}

// ===== SCROLL ANIMATIONS =====
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if(entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.social-card, .press-card, .faq-item').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)';
        observer.observe(card);
    });
}

// ===== COUNTER ANIMATION =====
function animateCounter(element, target) {
    let current = 0;
    const increment = target / 50;
    const timer = setInterval(() => {
        current += increment;
        if(current >= target) {
            clearInterval(timer);
            current = target;
        }
        element.textContent = Math.floor(current).toLocaleString() + '+';
    }, 30);
}

function initCounterAnimation() {
    const socialSection = document.querySelector('.social-section');
    if(socialSection) {
        const socialObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if(entry.isIntersecting) {
                    document.querySelectorAll('.social-followers').forEach(el => {
                        const text = el.textContent;
                        const num = parseInt(text.replace(/[^0-9]/g, '')) * 1000;
                        animateCounter(el, num / 1000);
                    });
                    socialObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        socialObserver.observe(socialSection);
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    initSmoothScroll();
    initNavbarScroll();
    initHorizontalScroll();
    initModalEvents();
    initPressLogos();
    initScrollAnimations();
    initCounterAnimation();
    initMobileDropdowns();
});
