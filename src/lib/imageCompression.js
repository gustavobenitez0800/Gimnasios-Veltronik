// ============================================
// VELTRONIK - IMAGE COMPRESSION UTILITY
// ============================================
// Comprime imágenes localmente usando HTML5 Canvas
// antes de subirlas al servidor para ahorrar Storage.
// ============================================

/**
 * Comprime una imagen File/Blob usando Canvas.
 * @param {File|Blob} file - El archivo de imagen original
 * @param {Object} options - Opciones de compresión
 * @param {number} options.maxWidth - Ancho máximo (default: 800)
 * @param {number} options.maxHeight - Alto máximo (default: 800)
 * @param {number} options.quality - Calidad JPEG/WEBP 0 a 1 (default: 0.8)
 * @param {string} options.type - Tipo de salida (default: 'image/webp')
 * @returns {Promise<Blob>} - La imagen comprimida
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.8,
    type = 'image/webp'
  } = options;

  // Si no es imagen, devolver el archivo original
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Si es un GIF o SVG, no comprimir con canvas porque rompe la animación o la escala
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calcular nueva escala manteniendo el aspecto
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height *= maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width *= maxHeight / height));
            height = maxHeight;
          }
        }

        // Crear Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        
        // Rellenar fondo transparente con blanco si se guarda como JPEG
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convertir Canvas a Blob comprimido
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob failed'));
            }
          },
          type,
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}
