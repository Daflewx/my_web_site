import { initGallery, loadWorks } from './gallery.js';
import { initAdmin } from './upload.js';
import { config } from './config.js';
import { initLanguage, t } from './i18n.js';

initLanguage();

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', t('Открыть меню'));
}
menuButton.addEventListener('click', () => {
  const open = navigation.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', t(open ? 'Закрыть меню' : 'Открыть меню'));
});
navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.querySelector('#year').textContent = new Date().getFullYear();
function translateControls() {
  menuButton.setAttribute('aria-label', t(navigation.classList.contains('is-open') ? 'Закрыть меню' : 'Открыть меню'));
  document.querySelectorAll('.hero-swiper .swiper-slide').forEach((slide, index, slides) => {
    slide.setAttribute('aria-label', t('Кадр {index} из {total}', { index: Number(slide.dataset.swiperSlideIndex ?? index) + 1, total: slides.length }));
  });
  const status = document.querySelector('#contact-status');
  if (status.dataset.message) status.textContent = t(status.dataset.message, { email: config.contactEmail });
}
document.addEventListener('languagechange', translateControls);

// CDN-ошибка не останавливает фильтры, формы и доступ к оригинальным медиа.
function initLibraries() {
  if (window.AOS && !motion.matches) {
    window.AOS.init({ duration: 700, offset: 55, once: true, easing: 'ease-out-cubic' });
    document.body.classList.add('aos-ready');
  }
  if (window.Swiper) new window.Swiper('.hero-swiper', {
    slidesPerView: 1, loop: true, speed: motion.matches ? 0 : 650,
    effect: 'fade', fadeEffect: { crossFade: true },
    navigation: { nextEl: '.hero-next', prevEl: '.hero-prev' },
    keyboard: { enabled: true, onlyInViewport: true },
    a11y: { prevSlideMessage: 'Предыдущий кадр', nextSlideMessage: 'Следующий кадр', slideLabelMessage: 'Кадр {{index}} из {{slidesLength}}' },
    on: { slideChange(swiper) {
      const counter = document.querySelector('.slide-index');
      counter.replaceChildren(document.createTextNode(`${String(swiper.realIndex + 1).padStart(2, '0')} `));
      const total = document.createElement('span'); total.textContent = '/ 03'; counter.append(total);
    } },
  });
  else document.querySelectorAll('.hero-prev, .hero-next').forEach(button => { button.disabled = true; });
  translateControls();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLibraries, { once: true });
else initLibraries();

document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  document.querySelector('#contact-message').value = t('Меня интересует {service}. ', { service: t(link.dataset.service).toLowerCase() });
}));
document.querySelector('#contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const status = document.querySelector('#contact-status');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)) {
    // Укажите email получателя в js/config.js; посетителям не показываем настройки проекта.
    status.dataset.message = 'Форма связи пока недоступна.';
    status.textContent = t(status.dataset.message);
    return;
  }
  const data = new FormData(event.currentTarget);
  const subject = encodeURIComponent(t('Запрос на съёмку от {name}', { name: data.get('name') }));
  const body = encodeURIComponent(t('Имя: {name}\nEmail: {email}\n\n{message}', Object.fromEntries(data)));
  location.href = `mailto:${config.contactEmail}?subject=${subject}&body=${body}`;
  status.dataset.message = 'Письмо подготовлено. Отправьте его из почтового приложения; если оно не открылось, напишите на {email}';
  status.textContent = t(status.dataset.message, { email: config.contactEmail });
});

initGallery();
loadWorks();
initAdmin();
