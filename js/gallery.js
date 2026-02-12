/**
 * Elena Giordani - X-Fit Academy
 * Gallery & Lightbox JavaScript
 * Version: 8.0 - Local images
 */

// ===== TRANSFORMATIONS GALLERY =====
const transformationImages = [];
for (let i = 37; i <= 186; i++) {
    transformationImages.push('img/prima-e-dopo-webp/' + i + '.webp');
}

let currentLightboxIndex = 0;

// ===== GALLERY MODAL =====
function openGalleryModal() {
    const modal = document.getElementById('galleryModal');
    const grid = document.getElementById('galleryGrid');

    if (!modal || !grid) return;

    grid.innerHTML = '';
    transformationImages.forEach((src, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumb';
        thumb.innerHTML = '<img src="' + src + '" alt="Trasformazione ' + (index + 1) + '" loading="lazy">';
        thumb.onclick = function() { openLightbox(index); };
        grid.appendChild(thumb);
    });

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeGalleryModal() {
    const modal = document.getElementById('galleryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ===== LIGHTBOX =====
function openLightbox(index) {
    currentLightboxIndex = index;
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImage');

    if (!lightbox || !img) return;

    img.src = transformationImages[index];
    lightbox.classList.add('active');
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
    }
}

function showPrevImage() {
    currentLightboxIndex = (currentLightboxIndex - 1 + transformationImages.length) % transformationImages.length;
    const img = document.getElementById('lightboxImage');
    if (img) {
        img.src = transformationImages[currentLightboxIndex];
    }
}

function showNextImage() {
    currentLightboxIndex = (currentLightboxIndex + 1) % transformationImages.length;
    const img = document.getElementById('lightboxImage');
    if (img) {
        img.src = transformationImages[currentLightboxIndex];
    }
}

// ===== KEYBOARD NAVIGATION =====
document.addEventListener('keydown', function(e) {
    const lightbox = document.getElementById('lightbox');
    const galleryModal = document.getElementById('galleryModal');

    if (lightbox && lightbox.classList.contains('active')) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') showPrevImage();
        if (e.key === 'ArrowRight') showNextImage();
    } else if (galleryModal && galleryModal.classList.contains('active')) {
        if (e.key === 'Escape') closeGalleryModal();
    }
});
