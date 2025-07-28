// js/main.js
const PHOTOS_PER_PAGE = 6; // Define cuántas fotos mostrar por página

document.addEventListener('DOMContentLoaded', () => {
    initStarfield(); // Iniciar el fondo de estrellas en todas las páginas

    const pathname = window.location.pathname;
    
    if (pathname.includes('galeria.html')) {
        loadGallery(); // Carga inicial de la galería
        setupPaginationListener(); // Activa la paginación dinámica
    } else if (pathname.includes('imagen.html')) {
        loadImageDetail();
    } else if (document.getElementById('deep-space-card')) { // Para la página de inicio
        // Esta es la lógica original para la página de inicio
        setDynamicBackgrounds();

        // ===== NUEVA LÓGICA PARA EL CONTADOR DE VISTAS DEL INDEX =====
        // 1. Envía una señal al servidor para registrar la visita a la página de inicio.
        fetch('/view/index', { method: 'POST' });
        
        // 2. Pide al servidor las estadísticas actualizadas para mostrarlas.
        fetch('/stats')
            .then(response => response.json())
            .then(data => {
                // Busca el elemento en la página donde se mostrará el contador.
                const counterElement = document.getElementById('index-view-counter');
                if (counterElement) {
                    // Actualiza el texto con el número de vistas.
                    counterElement.textContent = data.indexViews || 0;
                }
            })
            .catch(error => {
                console.error('Error al obtener las estadísticas del index:', error);
                const counterElement = document.getElementById('index-view-counter');
                if (counterElement) {
                    counterElement.textContent = 'N/A'; // Muestra N/A si hay un error
                }
            });
        // =============================================================
    }

    // --- El resto de tu código se mantiene igual ---
    window.addEventListener('popstate', () => {
        if (window.location.pathname.includes('galeria.html')) {
            loadGallery();
        }
    });
});

function initStarfield() {
    // Tu código para el fondo de estrellas no necesita cambios.
    // Se mantiene exactamente como lo tenías.
    const canvas = document.createElement('canvas');
    const body = document.querySelector('body');
    if (!body) return;
    body.prepend(canvas);
    canvas.id = 'starfield';
    const ctx = canvas.getContext('2d');
    let stars = [];
    const numStars = 500;
    const setCanvasSize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    const createStars = () => {
        stars = [];
        for (let i = 0; i < numStars; i++) {
            const maxAlpha = 0.5 + Math.random() * 0.5;
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.2,
                speed: 0.1 + Math.random() * 0.3,
                alpha: Math.random() * maxAlpha,
                maxAlpha: maxAlpha,
                minAlpha: maxAlpha * 0.1,
                twinkleSpeed: 0.002 + Math.random() * 0.008,
                twinkleDirection: Math.random() > 0.5 ? 1 : -1
            });
        }
    };
    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const star of stars) {
            star.x -= star.speed;
            if (star.x < 0) {
                star.x = canvas.width + star.radius;
                star.y = Math.random() * canvas.height;
            }
            star.alpha += star.twinkleSpeed * star.twinkleDirection;
            if (star.alpha >= star.maxAlpha) {
                star.alpha = star.maxAlpha;
                star.twinkleDirection = -1;
            } else if (star.alpha <= star.minAlpha) {
                star.alpha = star.minAlpha;
                star.twinkleDirection = 1;
            }
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220, 220, 220, ${Math.max(0, star.alpha)})`;
            ctx.fill();
        }
        requestAnimationFrame(draw);
    };
    window.addEventListener('resize', () => {
        setCanvasSize();
        createStars();
    });
    setCanvasSize();
    createStars();
    requestAnimationFrame(draw);
}

/**
 * --- FONDOS DINÁMICOS PARA LA GALERÍA ---
 * Busca las últimas fotos de cada categoría y las establece como
 * fondo para los enlaces en la página de inicio.
 */
function setDynamicBackgrounds() {
    const deepSpaceCard = document.getElementById('deep-space-card');
    const planetaryCard = document.getElementById('planetary-card');

    // Si las tarjetas no existen, no estamos en la página de inicio.
    if (!deepSpaceCard || !planetaryCard) {
        return;
    }

    if (typeof astroPhotos !== 'undefined' && astroPhotos.length > 0) {
        // Encontrar la última foto de cada categoría (la más reciente)
        const lastDeepSpacePhoto = [...astroPhotos].reverse().find(p => p.category === 'profundo');
        const lastPlanetaryPhoto = [...astroPhotos].reverse().find(p => p.category === 'planetaria');

        if (lastDeepSpacePhoto) {
            deepSpaceCard.style.backgroundImage = `url('${lastDeepSpacePhoto.thumbnail}')`;
        }
        if (lastPlanetaryPhoto) {
            planetaryCard.style.backgroundImage = `url('${lastPlanetaryPhoto.thumbnail}')`;
        }
    }
}

/**
 * --- NUEVO: Activa la paginación dinámica ---
 * Escucha los clics en los controles de paginación para cargar
 * el contenido sin recargar la página.
 */
function setupPaginationListener() {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    paginationContainer.addEventListener('click', (e) => {
        // Actuar solo si se hizo clic en un enlace <a>
        if (e.target.tagName !== 'A') return;
        
        // Prevenir la recarga de la página
        e.preventDefault();

        const link = e.target;
        // No hacer nada si el botón está deshabilitado (p. ej. "Anterior" en la pág 1)
        if (link.parentElement.classList.contains('disabled') || link.parentElement.classList.contains('active')) {
            return;
        }

        // Actualizar la URL en la barra de direcciones del navegador
        history.pushState(null, '', link.href);

        // Cargar el contenido de la nueva página de la galería
        loadGallery();
    });
}

function loadGallery() {
    const galleryGrid = document.getElementById('gallery-grid');
    const galleryTitle = document.getElementById('gallery-title');
    const paginationControls = document.getElementById('pagination-controls');

    // Verificación de seguridad: Asegurarse de que los datos de las fotos existan.
    if (typeof astroPhotos === 'undefined' || !Array.isArray(astroPhotos)) {
        console.error("La variable 'astroPhotos' no está definida o no es un array. Revisa que 'js/data.js' se cargue correctamente y no tenga errores.");
        if (galleryGrid) galleryGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Error: No se pudieron cargar los datos de la galería.</p>';
        if (galleryTitle) galleryTitle.textContent = 'Error';
        if (paginationControls) paginationControls.innerHTML = '';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const tipo = params.get('tipo');
    const currentPage = parseInt(params.get('page') || '1', 10);
    if (!tipo || !galleryGrid || !galleryTitle) return;

    galleryTitle.textContent = tipo === 'profundo' ? 'Espacio Profundo' : 'Planetaria';
    const filteredPhotos = astroPhotos
        .filter(photo => photo.category === tipo)
        .sort((a, b) => b.id.localeCompare(a.id)); // Ordenar de más nueva a más vieja
    if (filteredPhotos.length === 0) {
        galleryGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">No hay fotos en esta categoría todavía.</p>';
        // Limpiar la paginación si no hay fotos
        if (paginationControls) paginationControls.innerHTML = ''; // La referencia ya existe
        return;
    }
    
      // --- Lógica de Paginación ---
    const totalPages = Math.ceil(filteredPhotos.length / PHOTOS_PER_PAGE);
    const startIndex = (currentPage - 1) * PHOTOS_PER_PAGE;
    const endIndex = startIndex + PHOTOS_PER_PAGE;
    const photosForPage = filteredPhotos.slice(startIndex, endIndex);

    galleryGrid.innerHTML = '';
    photosForPage.forEach(photo => {
        const item = document.createElement('a');
        item.href = `imagen.html?id=${photo.id}`;
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${photo.thumbnail}" alt="${photo.title}" loading="lazy">
            <div class="photo-info">
                <h3>${photo.title}</h3>
                ${photo.date ? `<span class="date">${photo.date}</span>` : ''}
            </div>
        `;
        galleryGrid.appendChild(item);
    });

    renderPagination(currentPage, totalPages, tipo);
}

/**
 * --- Renderiza los controles de paginación ---
 * @param {number} currentPage La página actual.
 * @param {number} totalPages El número total de páginas.
 * @param {string} tipo La categoría actual.
 */
function renderPagination(currentPage, totalPages, tipo) {
    const paginationControls = document.getElementById('pagination-controls');
    if (!paginationControls) return;

    paginationControls.innerHTML = '';

    if (totalPages <= 1) return; // No mostrar paginación si solo hay una página

    // Botón "Anterior"
    const prevLi = document.createElement('li');
    if (currentPage === 1) {
        prevLi.classList.add('disabled');
    }
    prevLi.innerHTML = `<a href="galeria.html?tipo=${tipo}&page=${currentPage - 1}">« Anterior</a>`;
    paginationControls.appendChild(prevLi);

    // Botones de número de página
    for (let i = 1; i <= totalPages; i++) {
        const pageLi = document.createElement('li');
        if (i === currentPage) {
            pageLi.classList.add('active');
        }
        pageLi.innerHTML = `<a href="galeria.html?tipo=${tipo}&page=${i}">${i}</a>`;
        paginationControls.appendChild(pageLi);
    }

    // Botón "Siguiente"
    const nextLi = document.createElement('li');
    if (currentPage === totalPages) {
        nextLi.classList.add('disabled');
    }
    nextLi.innerHTML = `<a href="galeria.html?tipo=${tipo}&page=${currentPage + 1}">Siguiente »</a>`;
    paginationControls.appendChild(nextLi);
}

function loadImageDetail() {
    const params = new URLSearchParams(window.location.search);
    const photoId = params.get('id');
    const wrapper = document.getElementById('image-detail-wrapper');

    if (typeof astroPhotos === 'undefined' || !Array.isArray(astroPhotos)) {
        console.error("La variable 'astroPhotos' no está definida o no es un array.");
        if (wrapper) wrapper.innerHTML = '<h1>Error al cargar datos</h1>';
        return;
    }
    if (!photoId || !wrapper) return;

    const photo = astroPhotos.find(p => p.id === photoId);
    if (!photo) {
        wrapper.innerHTML = '<h1>404 - Foto no encontrada</h1>';
        return;
    }
    
    // Registrar la vista (sin cambios)
    fetch(`/view/${photoId}`, { method: 'POST' });

    const viewerItems = [
        { type: 'image', src: photo.fullImage, thumb: photo.thumbnail || photo.fullImage }, 
        ...(photo.gallery || []).map(item => ({...item, thumb: item.type === 'video' ? photo.thumbnail : item.src }))
    ];
    let currentIndex = 0;

    // ===== CAMBIO CLAVE: REORGANIZAR EL HTML =====
    // La fecha ahora está en una etiqueta <p> justo debajo del título <h1>.
    // El div .post-meta ahora solo contiene las estadísticas.
    wrapper.innerHTML = `
        <h1 class="single-post-title">${photo.title}</h1>
        <p class="post-date">${photo.date}</p> 

        <div class="post-meta">
            <div class="post-stats">
                <span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                    Vistas: ${photo.views || 0}
                </span>
                <span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: -2px; margin-right: 4px;"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                    Descargas: ${photo.downloads || 0}
                </span>
            </div>
        </div>

        <div class="post-viewer">
            <div class="viewer-main-display"></div>
            ${viewerItems.length > 1 ? `<div class="viewer-controls"><button id="viewer-prev" class="control-button">‹</button><button id="viewer-next" class="control-button">›</button></div>` : ''}
            ${viewerItems.length > 1 ? `<div class="viewer-thumbnails">${viewerItems.map((item, index) => `<div class="thumb-item ${index === 0 ? 'active' : ''}" data-index="${index}"><img src="${item.thumb}" alt="Miniatura ${index + 1}"></div>`).join('')}</div>` : ''}
        </div>

        <div class="post-description">${photo.description}</div>

        <div class="tech-card">
            <h2>Ficha Técnica</h2>
            <ul>${Object.entries(photo.techDetails).map(([key, value]) => {
                const labelMap = { 'Camara': 'Cámara', 'Exposicion': 'Exposición', 'Flujo_de_procesado': 'Flujo de procesado' };
                const label = labelMap[key] || key.replace(/_/g, ' ');
                return `<li><strong>${label}</strong> ${value}</li>`;
            }).join('')}</ul>
        </div>
    `;
    // ================================================================

    const thumbnails = wrapper.querySelectorAll('.thumb-item');
    const nextBtn = wrapper.querySelector('#viewer-next');
    const prevBtn = wrapper.querySelector('#viewer-prev');
    const showItem = (index) => {
        // La lógica de esta función anidada no necesita cambios.
        const item = viewerItems[index];
        const mainDisplay = wrapper.querySelector('.viewer-main-display');
        mainDisplay.innerHTML = '';
        if (index === 0 && photo.starlessImage) {
            const sliderHTML = `<img-comparison-slider class="slider-with-custom-handle"><img slot="first" src="${photo.fullImage}" alt="Antes" /><img slot="second" src="${photo.starlessImage}" alt="Después" /><svg slot="handle" xmlns="http://www.w3.org/2000/svg" width="100" viewBox="-8 -3 16 6"><path d="M -5 -2 L -7 0 L -5 2 M 5 -2 L 7 0 L 5 2" fill="none" stroke="white" stroke-width="1" /></svg></img-comparison-slider>`;
            const downloadButtonHTML = `<a href="/download/${photo.id}?item=0" class="viewer-download-btn" title="Descargar imagen" download><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></a>`;
            mainDisplay.innerHTML = sliderHTML + downloadButtonHTML;
        } else {
            let mediaHTML = '', downloadButtonHTML = '';
            if (item.type === 'image') {
                mediaHTML = `<img src="${item.src}" alt="Vista principal">`;
                downloadButtonHTML = `<a href="/download/${photo.id}?item=${index}" class="viewer-download-btn" title="Descargar imagen" download><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></a>`;
            } else { mediaHTML = `<video src="${item.src}" controls autoplay muted loop></video>`; }
            mainDisplay.innerHTML = mediaHTML + downloadButtonHTML;
        }
        thumbnails.forEach(thumb => thumb.classList.remove('active'));
        if (thumbnails[index]) thumbnails[index].classList.add('active');
        currentIndex = index;
    };
    if (nextBtn) nextBtn.addEventListener('click', () => showItem((currentIndex + 1) % viewerItems.length));
    if (prevBtn) prevBtn.addEventListener('click', () => showItem((currentIndex - 1 + viewerItems.length) % viewerItems.length));
    thumbnails.forEach(thumb => thumb.addEventListener('click', () => showItem(parseInt(thumb.dataset.index, 10))));
    showItem(0);
}