import { getSupabase, isConfigured } from './supabase.js';
import { config } from './config.js';
import { appendWork, applyFilter } from './gallery.js';
import { validateMedia, inspectMedia, createThumbnail, fileTypes } from './media.js';
import { t } from './i18n.js';

// Корень приложения определяется по модулю, включая /repository/ на статическом хостинге.
const siteRoot = new URL('../', import.meta.url);
const adminPath = `${siteRoot.pathname}admin`;

export function initAdmin() {
  const dialog = document.querySelector('#admin-dialog');
  const login = document.querySelector('#login-form');
  const panel = document.querySelector('#admin-panel');
  const upload = document.querySelector('#upload-form');
  const status = document.querySelector('#admin-status');
  let authRevision = 0;
  let uploading = false;
  let lastMessage = '';
  const message = text => { lastMessage = text; status.textContent = t(text); };
  document.addEventListener('languagechange', () => { status.textContent = t(lastMessage); });

  async function syncSession() {
    const revision = ++authRevision;
    try {
      const client = await getSupabase();
      if (!client) return;
      const { data: { user }, error } = await client.auth.getUser();
      if (revision !== authRevision) return;
      if (!user) { panel.hidden = true; login.hidden = false; return; }
      if (error) throw error;
      const { data: admin, error: roleError } = await client.rpc('is_portfolio_admin');
      if (revision !== authRevision) return;
      if (roleError) throw roleError;
      panel.hidden = !admin;
      login.hidden = Boolean(admin);
      if (!admin) {
        await client.auth.signOut();
        message('У этого аккаунта нет прав администратора. Назначьте роль в Supabase по инструкции README.');
      } else message('Вы вошли. Новые работы будут опубликованы в галерее.');
    } catch (error) { panel.hidden = true; login.hidden = false; message(t('Не удалось проверить доступ: {error}', { error: t(error.message) })); }
  }

  async function openFromLocation() {
    if (!(location.pathname.replace(/\/$/, '') === adminPath || location.hash === '#admin')) return;
    if (!dialog.open) dialog.showModal();
    if (!isConfigured()) {
      message('Демо-режим: заполните js/config.js и выполните supabase/schema.sql. Вход и загрузка станут доступны после подключения.');
      login.querySelector('button').disabled = true;
      return;
    }
    await syncSession();
  }
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (location.pathname.replace(/\/$/, '') === adminPath || location.hash === '#admin') history.replaceState(null, '', siteRoot.pathname);
  });
  window.addEventListener('hashchange', openFromLocation);
  window.addEventListener('popstate', openFromLocation);

  login.addEventListener('submit', async event => {
    event.preventDefault();
    const button = login.querySelector('button');
    button.disabled = true;
    message('Проверяем доступ…');
    try {
      const client = await getSupabase();
      if (!client) throw new Error('Сначала подключите Supabase.');
      const values = new FormData(login);
      const { error } = await client.auth.signInWithPassword({ email: String(values.get('email')).trim(), password: values.get('password') });
      if (error) throw new Error('Не удалось войти. Проверьте email, пароль и подключение.');
      login.reset();
      await syncSession();
    } catch (error) { message(error.message); }
    finally { button.disabled = !isConfigured(); }
  });

  document.querySelector('#logout').addEventListener('click', async () => {
    if (uploading) return;
    try {
      const client = await getSupabase();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      authRevision++;
      panel.hidden = true;
      login.hidden = false;
      upload.reset();
      message('Вы вышли из аккаунта.');
    } catch (error) { message(t('Не удалось выйти: {error}', { error: t(error.message) })); }
  });

  upload.addEventListener('submit', async event => {
    event.preventDefault();
    if (uploading) return;
    const values = new FormData(upload);
    const file = values.get('file');
    const category = values.get('category');
    const title = String(values.get('title')).trim();
    let metadata;
    let client;
    const uploadedPaths = [];
    let published = false;
    uploading = true;
    const controls = [...upload.elements, document.querySelector('#logout')];
    controls.forEach(control => { control.disabled = true; });
    try {
      if (!title) throw new Error('Введите название работы.');
      const type = validateMedia(file, category);
      message('Проверяем медиафайл…');
      metadata = await inspectMedia(file, type);
      client = await getSupabase();
      if (!client) throw new Error('Supabase не подключён.');
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) throw new Error('Сессия закончилась. Войдите снова.');
      const id = crypto.randomUUID();
      const path = `${user.id}/${id}.${fileTypes[file.type]}`;
      message('Загружаем оригинал… Не закрывайте вкладку.');
      const { error: uploadError } = await client.storage.from(config.bucket).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      let thumbnailPath = null;
      if (type === 'image') {
        message('Создаём и загружаем превью…');
        const thumbnail = await createThumbnail(metadata.element, metadata.width, metadata.height);
        thumbnailPath = `${user.id}/${id}-thumb.webp`;
        const { error } = await client.storage.from(config.bucket).upload(thumbnailPath, thumbnail, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
        if (error) throw error;
        uploadedPaths.push(thumbnailPath);
      }
      const work = { id, title, description: String(values.get('description')).trim(), category, media_type: type, storage_path: path, thumbnail_path: thumbnailPath, width: metadata.width, height: metadata.height, owner_id: user.id };
      message('Публикуем карточку…');
      const { data, error } = await client.from('works').insert(work).select().single();
      if (error) throw error;
      published = true;
      appendWork(data, true);
      applyFilter('all');
      upload.reset();
      message('Готово! Работа опубликована и добавлена в начало галереи.');
    } catch (error) {
      let cleanupNote = '';
      // Storage и таблица не образуют общую транзакцию. При ошибке удаляем уже загруженные файлы.
      if (!published && client && uploadedPaths.length) {
        try {
          const { error: cleanupError } = await client.storage.from(config.bucket).remove(uploadedPaths);
          if (cleanupError) cleanupNote = ' Не удалось удалить незавершённую загрузку: проверьте Storage вручную.';
        } catch { cleanupNote = ' Проверьте Storage: могли остаться файлы незавершённой загрузки.'; }
      }
      message(t('Ошибка: {error}. {note}', { error: t(error.message), note: t(cleanupNote.trim()) }));
    } finally {
      metadata?.release();
      uploading = false;
      controls.forEach(control => { control.disabled = false; });
    }
  });
  window.addEventListener('beforeunload', event => {
    if (uploading) { event.preventDefault(); event.returnValue = ''; }
  });
  openFromLocation();
  // Обновление UI после выхода в другой вкладке. Не вызываем API внутри auth callback.
  if (isConfigured()) getSupabase().then(client => client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { authRevision++; panel.hidden = true; login.hidden = false; message('Сессия завершена. Войдите снова.'); }
  })).catch(error => message(t('Supabase недоступен: {error}', { error: error.message })));
}
