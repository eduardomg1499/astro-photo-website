const express = require('express');
const multer = require('multer');
const session = require('express-session'); // <-- NUEVO: Importar express-session
const sharp = require('sharp'); // <-- NUEVO: Importar la librería sharp
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// --- NUEVO: Contraseña de Administrador ---
// ¡IMPORTANTE! Cambia esta contraseña por una más segura.
// En una aplicación real, esto debería estar en una variable de entorno.
const ADMIN_PASSWORD = "1234";

// --- NUEVO: Configuración de la Sesión ---
app.use(session({
    secret: 'un_secreto_muy_largo_y_dificil_de_adivinar', // Cambia esto por otra frase aleatoria
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Poner en 'true' si usas HTTPS
}));


// --- Configuración de Multer para la subida de archivos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Los archivos se guardarán en una nueva carpeta 'uploads'
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Usar un nombre de archivo único para evitar sobreescrituras
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// --- Configuración de Multer (SOLUCIÓN AL ERROR) ---
// 1. Middleware para el formulario de CREACIÓN, que espera ambos campos.
const uploadCreate = multer({ storage: storage }).fields([
    { name: 'fullImage', maxCount: 1 },
    { name: 'galleryFiles', maxCount: 10 },
    { name: 'starlessImage', maxCount: 1 } // <-- CAMPO AÑADIDO
]);

// 2. Middleware para el formulario de EDICIÓN, que solo espera un campo opcional.
const uploadEdit = multer({ storage: storage }).single('fullImage');

// --- Middlewares ---
// Para poder leer los datos del formulario
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // <-- AÑADIR ESTA LÍNEA

// --- NUEVO: Función auxiliar para leer los datos de forma segura ---
function readPhotosData(dataPath) {
    try {
        if (!fs.existsSync(dataPath)) {
            console.error(`[ERROR EN LECTURA] El archivo de datos no existe en la ruta: ${dataPath}`);
            return [];
        }
        const dataFileContent = fs.readFileSync(dataPath, 'utf8');
        if (!dataFileContent.trim()) {
            console.warn(`[ADVERTENCIA EN LECTURA] El archivo ${dataPath} está vacío.`);
            return [];
        }
        
        // --- CORRECCIÓN CLAVE: Se quita el '?' para hacer la expresión "greedy" (codiciosa) ---
        // Esto asegura que capture todo desde el primer '[' hasta el ÚLTIMO ']',
        // evitando errores si los datos contienen corchetes.
        const match = dataFileContent.match(/=\s*(\[[\s\S]*\]);?/);

        if (match && match[1]) {
            try {
                return JSON.parse(match[1]);
            } catch (parseError) {
                console.error(`Error de sintaxis JSON en ${dataPath}:`, parseError);
                console.error("El archivo data.js parece estar corrupto. Por favor, revísalo.");
                return []; 
            }
        }
        console.warn(`[ADVERTENCIA EN LECTURA] No se encontró un array de datos válido en ${dataPath}.`);
        return [];
    } catch (readError) {
        console.error(`Error al leer el archivo ${dataPath}:`, readError);
        return [];
    }
}

// --- NUEVO: Función de escritura segura para prevenir corrupción de datos ---
function writePhotosData(dataPath, photos) {
    const tempPath = dataPath + '.tmp';
    try {
        const newDataFileContent = `const astroPhotos = ${JSON.stringify(photos, null, 4)};`;
        fs.writeFileSync(tempPath, newDataFileContent, 'utf8');
        // Renombrar es una operación atómica en la mayoría de sistemas, previene la corrupción.
        fs.renameSync(tempPath, dataPath);
    } catch (error) {
        console.error("Error crítico al escribir el archivo de datos:", error);
        // Si falla, se intenta eliminar el archivo temporal para no dejar basura.
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
}
// ===== NUEVO: FUNCIONES PARA LEER/ESCRIBIR ESTADÍSTICAS GLOBALES =====
const statsPath = path.join(__dirname, 'stats.json');

function readStatsData() {
    try {
        if (!fs.existsSync(statsPath)) {
            fs.writeFileSync(statsPath, JSON.stringify({ indexViews: 0 }));
            return { indexViews: 0 };
        }
        const statsData = fs.readFileSync(statsPath, 'utf8');
        return JSON.parse(statsData);
    } catch (error) {
        console.error("Error al leer stats.json:", error);
        return { indexViews: 0 };
    }
}

function writeStatsData(stats) {
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8');
    } catch (error) {
        console.error("Error al escribir en stats.json:", error);
    }
}
// =================================================================
// --- NUEVO: Middleware de Autenticación ---
// Esta función revisará si el usuario ha iniciado sesión en cada ruta protegida.
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        next(); // El usuario está autenticado, continuar.
    } else {
        res.redirect('/login.html'); // No está autenticado, redirigir a la página de login.
    }
};

// --- NUEVO: Rutas de Autenticación ---
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true; // Marcar la sesión como autenticada
        res.redirect('/admin.html');
    } else {
        res.send('<h1>Contraseña incorrecta.</h1><a href="/login.html">Intentar de nuevo</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// --- NUEVO: Proteger el acceso a admin.html ---
// Esta ruta intercepta la petición a /admin.html y aplica el middleware de autenticación.
app.get('/admin.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- Ruta para gestionar la subida ---
app.post('/upload', requireAuth, uploadCreate, async (req, res) => {
    try {
        if (!req.files || !req.files.fullImage || !req.files.fullImage.length) {
            return res.status(400).json({ message: 'No se ha subido una imagen principal.' });
        }
        const dataPath = path.join(__dirname, 'js', 'data.js');
        
        // --- DIAGNÓSTICO PASO 1: Ver qué se leyó del archivo ---
        console.log('--- INICIANDO PROCESO DE SUBIDA ---');
        const photos = readPhotosData(dataPath);
        console.log(`[PASO 1] Fotos leídas del archivo data.js. Número de fotos encontradas: ${photos.length}`);
        if (photos.length > 0) {
            console.log('[PASO 1 - Contenido]:', JSON.stringify(photos, null, 2));
        }

        // --- MANEJO DE LA IMAGEN 'STARLESS' (YA IMPLEMENTADO CORRECTAMENTE) ---
        let starlessImagePath = null; 
        if (req.files.starlessImage && req.files.starlessImage.length > 0) {
            const starlessImageFile = req.files.starlessImage[0];
            starlessImagePath = `uploads/${starlessImageFile.filename}`;
        }
        // --------------------------------------------------------------------

        const newId = 'img' + Date.now();
        const mainImageFile = req.files.fullImage[0];
        const fullImagePath = `uploads/${mainImageFile.filename}`;
        const thumbnailPath = `uploads/thumb_${mainImageFile.filename}`;
        await sharp(mainImageFile.path).resize(400, 400, { fit: 'cover', position: 'entropy' }).toFile(path.join(__dirname, thumbnailPath));
        
        const galleryItems = [];
        if (req.files.galleryFiles && req.files.galleryFiles.length > 0) {
            req.files.galleryFiles.forEach(file => {
                galleryItems.push({
                    type: file.mimetype.startsWith('video') ? 'video' : 'image',
                    src: `uploads/${file.filename}`
                });
            });
        }

        const techDetailsClean = {};
        for (const key in req.body.techDetails) {
            if (req.body.techDetails[key]) {
                techDetailsClean[key] = req.body.techDetails[key];
            }
        }

        const newPhoto = {
            id: newId,
            title: req.body.title,
            description: req.body.description,
            // El formato de la fecha está correcto. Lo he limpiado un poco.
            date: new Date(`${req.body.date}T12:00:00`).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
            category: req.body.category,
            fullImage: fullImagePath,
            starlessImage: starlessImagePath, // <-- PROPIEDAD 'STARLESS' AÑADIDA CORRECTAMENTE
            thumbnail: thumbnailPath,
            gallery: galleryItems,
            techDetails: techDetailsClean,
            downloads: 0,
            views: 0
        };

        // --- DIAGNÓSTICO PASO 2: Verificar que la nueva foto se añade correctamente ---
        photos.push(newPhoto);
        console.log(`[PASO 2] Nueva foto añadida al array. El array ahora tiene ${photos.length} fotos.`);
        writePhotosData(dataPath, photos);
        console.log('--- SUBIDA COMPLETADA CON ÉXITO ---');

        res.redirect('/admin.html');
    } catch (error) {
        console.error('Error catastrófico al subir la foto:', error);
        res.status(500).send('<h1>Error del servidor</h1><p>Hubo un error al procesar tu solicitud.</p><a href="/admin.html">Volver</a>');
    }
});

// ===== AQUÍ VA EL NUEVO BLOQUE DE RUTAS PARA LOS CONTADORES =====
app.post('/view/:id', (req, res) => {
    try {
        const photoId = req.params.id;
        const dataPath = path.join(__dirname, 'js', 'data.js');
        const photos = readPhotosData(dataPath);
        const photoIndex = photos.findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            photos[photoIndex].views = (photos[photoIndex].views || 0) + 1;
            writePhotosData(dataPath, photos);
            res.status(200).json({ success: true, views: photos[photoIndex].views });
        } else {
            res.status(404).json({ success: false, message: 'Foto no encontrada.' });
        }
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/view/index', (req, res) => {
    try {
        const stats = readStatsData();
        stats.indexViews = (stats.indexViews || 0) + 1;
        writeStatsData(stats);
        res.status(200).json({ success: true, views: stats.indexViews });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/stats', (req, res) => {
    try {
        const stats = readStatsData();
        res.status(200).json(stats);
    } catch (error) { res.status(500).json({ indexViews: 'Error' }); }
});
// =====================================================================

// --- NUEVA RUTA: Eliminar una foto ---
app.delete('/delete/:id', requireAuth, (req, res) => {
    try {
        const photoId = req.params.id;
        const dataPath = path.join(__dirname, 'js', 'data.js');
        const photos = readPhotosData(dataPath);
        const photoToDelete = photos.find(p => p.id === photoId);
        if (!photoToDelete) {
            return res.status(404).json({ message: 'Foto no encontrada.' });
        }
        
        const updatedPhotos = photos.filter(p => p.id !== photoId);

        // ===== CAMBIO CLAVE: Añadir starlessImage a la lista de archivos a borrar =====
        const filesToDelete = [photoToDelete.fullImage, photoToDelete.thumbnail, photoToDelete.starlessImage];
        // =========================================================================

        if (photoToDelete.gallery && Array.isArray(photoToDelete.gallery)) {
            photoToDelete.gallery.forEach(item => {
                if (item.src) {
                    filesToDelete.push(item.src);
                }
            });
        }

        filesToDelete.forEach(imgPath => {
            if (imgPath && fs.existsSync(path.join(__dirname, imgPath))) {
                fs.unlinkSync(path.join(__dirname, imgPath));
            }
        });

        writePhotosData(dataPath, updatedPhotos);
        console.log(`Foto con ID ${photoId} eliminada con éxito.`);
        res.status(200).json({ message: `Foto "${photoToDelete.title}" eliminada con éxito.` });

    } catch (error) {
        console.error('Error al eliminar la foto:', error);
        res.status(500).json({ message: 'Hubo un error en el servidor al eliminar la foto.' });
    }
});

// --- RUTA DE DESCARGA ACTUALIZADA: Descarga la imagen correcta del visor ---
// --- RUTA DE DESCARGA ACTUALIZADA: Fuerza la descarga directa del archivo ---
app.get('/download/:id', (req, res) => {
    try {
        const photoId = req.params.id;
        const itemIndex = parseInt(req.query.item || '0', 10);
        const dataPath = path.join(__dirname, 'js', 'data.js');
        const photos = readPhotosData(dataPath);

        const photoIndex = photos.findIndex(p => p.id === photoId);
        if (photoIndex === -1) {
            return res.status(404).send('<h1>404 - Foto no encontrada.</h1>');
        }

        const photoData = photos[photoIndex];

        const viewerItems = [
            { src: photoData.fullImage, type: 'image' },
            ...(photoData.gallery || [])
        ];

        if (itemIndex < 0 || itemIndex >= viewerItems.length || viewerItems[itemIndex].type !== 'image') {
            return res.status(400).send('<h1>Petición inválida. El item no es una imagen descargable.</h1>');
        }

        // Incrementar el contador de descargas (esto no cambia)
        photos[photoIndex].downloads = (photos[photoIndex].downloads || 0) + 1;
        writePhotosData(dataPath, photos);

        const itemToDownload = viewerItems[itemIndex];
        const filePath = path.join(__dirname, itemToDownload.src);

        // --- CAMBIO CLAVE ---
        // 1. Crear un nombre de archivo amigable para el usuario.
        const fileExtension = path.extname(filePath); // Obtiene la extensión (ej: ".jpg")
        const friendlyFilename = `${photoData.title.replace(/ /g, '_')}-${photoData.id}${fileExtension}`;

        // 2. Usar res.download() en lugar de res.sendFile().
        // Esto automáticamente establece el encabezado 'Content-Disposition' a 'attachment',
        // forzando al navegador a abrir el diálogo de "Guardar como...".
        res.download(filePath, friendlyFilename, (err) => {
            if (err) {
                // Es importante manejar errores, especialmente si el archivo no se encuentra
                // o el usuario cancela la descarga.
                console.error("Error al procesar la descarga:", err);
                if (!res.headersSent) {
                    res.status(500).send("No se pudo descargar el archivo.");
                }
            }
        });

    } catch (error) {
        console.error('Error en la ruta de descarga:', error);
        res.status(500).send('<h1>Error del servidor al procesar la descarga.</h1>');
    }
});

// --- NUEVA RUTA: Editar una foto existente ---
app.post('/edit/:id', requireAuth, uploadEdit, async (req, res) => {
    try {
        const dataPath = path.join(__dirname, 'js', 'data.js');
        const photos = readPhotosData(dataPath);
        const photoId = req.params.id;

        const photoIndex = photos.findIndex(p => p.id === photoId);
        if (photoIndex === -1) {
            return res.status(404).json({ message: 'Foto no encontrada.' });
        }

        const photoToUpdate = photos[photoIndex];

        photoToUpdate.title = req.body.title || photoToUpdate.title;
        photoToUpdate.description = req.body.description || photoToUpdate.description;
        photoToUpdate.category = req.body.category || photoToUpdate.category;
        
        if (req.body.date) {
            photoToUpdate.date = new Date(`${req.body.date}T12:00:00`).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }

        const techDetailsRaw = req.body.techDetails;
        const techDetailsClean = {};
        for (const key in techDetailsRaw) {
            if (techDetailsRaw[key]) {
                techDetailsClean[key] = techDetailsRaw[key];
            }
        }
        photoToUpdate.techDetails = techDetailsClean;

        if (req.file) {
            const newImageFile = req.file;

            [photoToUpdate.fullImage, photoToUpdate.thumbnail].forEach(imgPath => {
                if (imgPath && fs.existsSync(path.join(__dirname, imgPath))) fs.unlinkSync(path.join(__dirname, imgPath));
            });

            photoToUpdate.fullImage = `uploads/${newImageFile.filename}`;
            const newThumbnailFilename = `thumb_${newImageFile.filename}`;
            photoToUpdate.thumbnail = `uploads/${newThumbnailFilename}`;
            await sharp(newImageFile.path).resize(400, 400, { fit: 'cover', position: 'entropy' }).toFile(path.join(__dirname, photoToUpdate.thumbnail));
        }

        writePhotosData(dataPath, photos);

        res.status(200).json({ message: 'Foto actualizada con éxito.' });
    } catch (error) {
        console.error('Error al editar la foto:', error);
        res.status(500).json({ message: 'Hubo un error en el servidor al editar la foto.' });
    }
});

// --- Servidor de archivos estáticos ---
// ¡IMPORTANTE! Esto debe ir DESPUÉS de todas las rutas específicas para que no se salte la seguridad.
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
    console.log(`¡Servidor en marcha!`);
    console.log(`Tu web está disponible en http://localhost:${port}`);
    console.log(`El panel de administración está en http://localhost:${port}/admin.html`);
});