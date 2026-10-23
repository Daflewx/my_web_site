import { getSupabase } from './supabase.js';
import { config } from './config.js';
import { categories } from './media.js';
import { t } from './i18n.js';

const gallery = document.querySelector('#gallery');
let activeCategory = 'all';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const observedVideos = new Set();
const videoObserver = new IntersectionObserver(entries => {
  for (const { target: video, isIntersecting } of entries) {
    if (isIntersecting && !document.hidden && !reducedMotion.matches) {
      const source = video.querySelector('source[data-src]');
      if (source) { source.src = source.dataset.src; delete source.dataset.src; video.load(); }
      video.play().catch(() => {}); // Autoplay может быть запрещён энергосбережением.
    } else video.pause();
  }
}, { rootMargin: '80px' });

export function observeVideos() {
  document.querySelectorAll('main video').forEach(video => {
    if (observedVideos.has(video)) return;
    const preview = video.closest('.work-media');
    if (preview) {
      // Пока autoplay не начался (например, при энергосбережении iOS),
      // показываем обложку вместо video с системной кнопкой Play.
      if (video.poster && !preview.querySelector('.video-poster')) {
        const poster = document.createElement('img');
        poster.className = 'video-poster';
        poster.src = video.poster;
        poster.alt = '';
        poster.loading = 'lazy';
        poster.setAttribute('aria-hidden', 'true');
        preview.prepend(poster);
      }
      video.addEventListener('playing', () => preview.classList.add('is-playing'));
      ['pause', 'ended', 'error', 'emptied'].forEach(event => {
        video.addEventListener(event, () => preview.classList.remove('is-playing'));
      });
    }
    video.autoplay = !reducedMotion.matches;
    observedVideos.add(video);
    videoObserver.observe(video);
  });
}
function refreshVideoPlayback() {
  observedVideos.forEach(video => {
    video.pause();
    video.autoplay = !reducedMotion.matches;
    videoObserver.unobserve(video);
    videoObserver.observe(video);
  });
}
document.addEventListener('visibilitychange', refreshVideoPlayback);
reducedMotion.addEventListener('change', refreshVideoPlayback);

export function applyFilter(category = activeCategory) {
  activeCategory = category;
  let count = 0;
  gallery.querySelectorAll('.work-card').forEach(card => {
    card.hidden = category !== 'all' && card.dataset.category !== category;
    if (!card.hidden) count++;
    else card.querySelector('video')?.pause();
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    const selected = button.dataset.filter === category;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#gallery-status').textContent = t('Показано работ: {count}', { count });
  document.querySelector('.gallery-empty').hidden = count > 0;
  document.querySelector('[data-filter="all"] span').textContent = String(gallery.children.length).padStart(2, '0');
  window.AOS?.refresh();
}

export function appendWork(work, prepend = false) {
  if (Array.from(gallery.children).some(card => card.dataset.id === work.id)) return;
  if (!Object.hasOwn(categories, work.category)) return;
  const publicUrl = path => `${config.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const article = document.createElement('article');
  article.className = `work-card${work.media_type === 'video' ? ' work-card--wide' : ''}`;
  article.dataset.id = work.id;
  article.dataset.category = work.category;
  const link = document.createElement('a');
  link.className = 'work-media';
  link.href = publicUrl(work.storage_path);
  link.dataset.pswpWidth = work.width;
  link.dataset.pswpHeight = work.height;
  link.setAttribute('aria-label', t('Открыть: {title}', { title: work.title }));
  if (work.media_type === 'video') {
    link.dataset.media = 'video';
    const video = document.createElement('video');
    ['autoplay', 'muted', 'loop', 'playsinline'].forEach(attr => video.setAttribute(attr, ''));
    video.muted = true;
    video.preload = 'none';
    video.width = work.width;
    video.height = work.height;
    if (work.thumbnail_path) video.poster = publicUrl(work.thumbnail_path);
    const source = document.createElement('source');
    source.dataset.src = link.href;
    source.type = 'video/mp4';
    video.append(source);
    link.append(video);
  } else {
    const image = document.createElement('img');
    image.src = publicUrl(work.thumbnail_path || work.storage_path);
    image.alt = work.description || work.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = work.width;
    image.height = work.height;
    link.append(image);
  }
  const caption = document.createElement('div');
  caption.className = 'work-caption';
  const title = document.createElement('h3');
  title.textContent = work.title; // Пользовательский текст никогда не вставляем через innerHTML.
  const category = document.createElement('span');
  category.textContent = t(categories[work.category]);
  caption.append(title, category);
  article.append(link, caption);
  if (prepend) gallery.prepend(article); else gallery.append(article);
  observeVideos();
  applyFilter();
}

export async function loadWorks() {
  try {
    const client = await getSupabase();
    if (!client) return;
    const { data, error } = await client.from('works').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    data.forEach(work => appendWork(work));
  } catch (error) {
    console.warn('Облачная галерея недоступна:', error.message);
    document.querySelector('#gallery-status').textContent = t('Не удалось загрузить облачные работы. Демонстрационная галерея доступна.');
  }
}

export async function initGallery() {
  document.addEventListener('languagechange', () => {
    applyFilter();
    gallery.querySelectorAll('[data-id]').forEach(card => {
      card.querySelector('.work-caption > span').textContent = t(categories[card.dataset.category]);
      card.querySelector('.work-media').setAttribute('aria-label', t('Открыть: {title}', { title: card.querySelector('h3').textContent }));
    });
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
  applyFilter();
  observeVideos();
  try {
    const { default: PhotoSwipeLightbox } = await import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.min.js');
    const lightbox = new PhotoSwipeLightbox({
      gallery: '#gallery', children: '.work-card:not([hidden]) .work-media',
      pswpModule: () => import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.min.js'),
      bgOpacity: .96, showHideAnimationType: reducedMotion.matches ? 'none' : 'zoom',
      closeTitle: 'Закрыть', zoomTitle: 'Увеличить', arrowPrevTitle: 'Предыдущая работа', arrowNextTitle: 'Следующая работа', errorMsg: 'Не удалось загрузить изображение.',
    });
    const translateLightbox = () => Object.assign(lightbox.options, {
      closeTitle: t('Закрыть'), zoomTitle: t('Увеличить'), arrowPrevTitle: t('Предыдущая работа'), arrowNextTitle: t('Следующая работа'), errorMsg: t('Не удалось загрузить изображение.'),
    });
    translateLightbox();
    document.addEventListener('languagechange', translateLightbox);
    lightbox.addFilter('itemData', (data) => {
      if (data.element?.dataset.media === 'video') data.type = 'video';
      return data;
    });
    lightbox.on('contentLoad', event => {
      const { content } = event;
      if (content.type !== 'video') return;
      event.preventDefault();
      const video = document.createElement('video');
      video.className = 'lightbox-video';
      video.src = content.data.src;
      video.controls = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = !reducedMotion.matches;
      video.preload = 'metadata';
      video.setAttribute('aria-label', content.data.element?.getAttribute('aria-label') || 'Видео');
      content.element = video;
    });
    lightbox.on('contentActivate', ({ content }) => {
      if (content.type === 'video' && !reducedMotion.matches) content.element?.play().catch(() => {});
    });
    lightbox.on('contentDeactivate', ({ content }) => { if (content.type === 'video') content.element?.pause(); });
    lightbox.on('contentRemove', ({ content }) => { if (content.type === 'video') content.element?.pause(); });
    lightbox.init();
  } catch (error) {
    // При сбое CDN остаются обычные ссылки на оригинальные файлы.
    console.warn('Лайтбокс недоступен:', error.message);
  }
}
