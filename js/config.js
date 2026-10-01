// Публичные настройки. Никогда не вставляйте service_role / secret key или пароль!
export const config = Object.freeze({
  supabaseUrl: '', // https://YOUR_PROJECT.supabase.co
  supabasePublishableKey: '', // publishable key (или legacy anon key) из Supabase → API Keys
  bucket: 'portfolio',
  contactEmail: '', // Ваш настоящий email; пока пусто, форма не имитирует отправку.
});
