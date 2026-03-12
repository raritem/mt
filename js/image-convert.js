/* ================================================================
   WoT Shop — Конвертация изображений (image-convert.js)
   Конвертация любых изображений в WebP через Canvas API
   ================================================================ */

'use strict';

window.ImageConvert = (() => {

  /**
   * Конвертировать File в WebP (base64, без префикса data:...)
   * @param {File} file         — исходный файл
   * @param {number} quality    — качество 0..1 (default 0.88)
   * @param {number} maxSize    — максимальная сторона в px (default 2560)
   * @returns {Promise<{base64: string, width: number, height: number}>}
   */
  function toWebP(file, quality, maxSize) {
    quality = quality != null ? quality : 0.88;
    maxSize = maxSize || 2560;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { naturalWidth: w, naturalHeight: h } = img;

        // Масштабируем если изображение слишком большое
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Проверяем поддержку WebP
        const supportsWebP = canvas.toDataURL('image/webp').startsWith('data:image/webp');
        const mimeType     = supportsWebP ? 'image/webp' : 'image/jpeg';
        const ext          = supportsWebP ? 'webp' : 'jpg';

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob вернул null')); return; }
            const reader = new FileReader();
            reader.onload = () => {
              // Убираем prefix "data:image/webp;base64,"
              const base64 = reader.result.split(',')[1];
              resolve({ base64, width: w, height: h, ext, mimeType });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось загрузить изображение: ' + file.name));
      };

      img.src = url;
    });
  }

  /**
   * Сгенерировать безопасное имя файла из оригинального
   * @param {string} originalName
   * @param {string} ext
   * @returns {string}
   */
  function safeFileName(originalName, ext) {
    const base = originalName
      .replace(/\.[^.]+$/, '')              // убираем расширение
      .toLowerCase()
      .replace(/[^a-z0-9а-яё_-]/gi, '_')   // заменяем спецсимволы
      .replace(/_+/g, '_')
      .slice(0, 40);
    return base + '.' + (ext || 'webp');
  }

  /**
   * Генерация уникального имени файла с timestamp
   * @param {number} idx
   * @param {string} ext
   */
  function numberedName(idx, ext) {
    return String(idx + 1).padStart(3, '0') + '.' + (ext || 'webp');
  }

  return { toWebP, safeFileName, numberedName };

})();
