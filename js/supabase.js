import { config } from './config.js';

let clientPromise;
export function isConfigured() {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(config.supabaseUrl) && Boolean(config.supabasePublishableKey);
}

// SDK загружается только при наличии конфигурации. Публичное портфолио работает и без облака.
export async function getSupabase() {
  if (!isConfigured()) return null;
  clientPromise ??= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm')
    .then(({ createClient }) => createClient(config.supabaseUrl, config.supabasePublishableKey))
    .catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}
