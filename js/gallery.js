/**
 * Elena Giordani - X-Fit Academy
 * Gallery & Lightbox JavaScript
 * Version: 7.2
 */

// ===== TRANSFORMATIONS GALLERY =====
const transformationIds = [
    '1XjrfjHV-t_swoK6fE8EcHXw-FdUUpRKg',
    '11U2umV07yCNEcw2-EoxxkRESn0HLX2X4',
    '1f9u1Ic00nys8FtjNHg12quy6bbi0xArN',
    '1JS-3IkIDi7qXSGtj7hXTGD5l0qPZJPTh',
    '1ILtoToU4fX93Ktf0zJvLxaUHsKr5D7-m',
    '12TBAcFoGawql1t5BNYMP2s-tsNcGFKYd',
    '1vQXMmVlE1qL5C2BPqRFHX0mGSo5d7-lK',
    '1wYRqTnHx8pJvLmC3BkQDo9eGSf2d6-mN',
    '1xZStUoIy9qKwMnD4ClREp0fHTg3e7-nO',
    '1yATuVpJz0rLxNoE5DmSFq1gIUh4f8-oP',
    '1zBUvWqKA1sMyOpF6EnTGr2hJVi5g9-pQ',
    '1ACVwXrLB2tNzPqG7FoUHs3iKWj6hA-qR'
];

let currentLightboxIndex = 0;

// ===== HELPER FUNCTIONS =====
function getDriveThumbUrl(id) {
    return `https://drive.google.com/thumbnail?id=${id}&sz=w400`;
}

function getDriveLargeUrl(id) {
    return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
}

// ===== GALLERY MODAL =====
function openGalleryModal() {
    const modal = document.getElementById('galleryModal');
    const grid = document.getElementById('galleryGrid');

    if (!modal || !grid) return;

    // Clear and populate grid
    grid.innerHTML = '';
    transformationIds.forEach((id, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumb';
        thumb.innerHTML = `<img src="${getDriveThumbUrl(id)}" alt="Trasformazione ${index + 1}" loading="lazy">`;
        thumb.onclick = () => openLightbox(index);
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

    img.src = getDriveLargeUrl(transformationIds[index]);
    lightbox.classList.add('active');
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
    }
}

function showPrevImage() {
    currentLightboxIndex = (currentLightboxIndex - 1 + transformationIds.length) % transformationIds.length;
    const img = document.getElementById('lightboxImage');
    if (img) {
        img.src = getDriveLargeUrl(transformationIds[currentLightboxIndex]);
    }
}

function showNextImage() {
    currentLightboxIndex = (currentLightboxIndex + 1) % transformationIds.length;
    const img = document.getElementById('lightboxImage');
    if (img) {
        img.src = getDriveLargeUrl(transformationIds[currentLightboxIndex]);
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
