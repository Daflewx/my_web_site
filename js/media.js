export const categories = { portraits: 'ПОРТРЕТ', reportage: 'РЕПОРТАЖ', video: 'ВИДЕО' };
export const fileTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' };

export function validateMedia(file, category) {
  if (!file || !file.size) throw new Error('Выберите непустой медиафайл.');
  if (!Object.hasOwn(fileTypes, file.type)) throw new Error('Поддерживаются только JPEG, PNG, WebP и MP4.');
  if (!Object.hasOwn(categories, category)) throw new Error('Выберите категорию из списка.');
  const video = file.type === 'video/mp4';
  if (video !== (category === 'video')) throw new Error('Для MP4 выберите категорию «Видео», для фото — «Портреты» или «Репортажи».');
  if (file.size > (video ? 50 : 10) * 1024 * 1024) throw new Error(video ? 'Видео должно быть не больше 50 МБ.' : 'Фото должно быть не больше 10 МБ.');
  return video ? 'video' : 'image';
}

// Blob URL всегда освобождается; размеры берутся из файла, а не из имени/расширения.
export function inspectMedia(file, type) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(type === 'video' ? 'video' : 'img');
    const timer = setTimeout(() => finish(new Error('Не удалось прочитать файл за 15 секунд.')), 15000);
    const finish = (error) => {
      clearTimeout(timer);
      element.onerror = element.onload = element.onloadedmetadata = null;
      const width = element.naturalWidth || element.videoWidth;
      const height = element.naturalHeight || element.videoHeight;
      if (error || !width || !height) {
        URL.revokeObjectURL(url);
        reject(error || new Error('У файла нет корректных размеров.'));
      } else resolve({ width, height, element, release: () => { element.removeAttribute('src'); if (type === 'video') element.load(); URL.revokeObjectURL(url); } });
    };
    element.onerror = () => finish(new Error('Файл повреждён или кодек не поддерживается браузером.'));
    if (type === 'video') { element.preload = 'metadata'; element.onloadedmetadata = () => finish(); }
    else element.onload = () => finish();
    element.src = url;
  });
}

export async function createThumbnail(element, width, height) {
  const scale = Math.min(1, 1000 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(element, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось создать превью.')), 'image/webp', .82));
}
