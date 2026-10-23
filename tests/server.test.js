import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('LAN preview serves public assets, canonicalizes admin, and hides private project files', async t => {
  const child = spawn(process.execPath, ['scripts/server.js', '--host'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Preview server did not start')), 5000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const address = output.match(/Portfolio: (http:\/\/localhost:\d+)/);
      if (address) { clearTimeout(timer); resolve(address[1]); }
    });
  });
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  // Media replacement examples in comments are not resources requested by the browser.
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  const localAssets = [...markup.matchAll(/\s(?:href|src)="(\.\/(?:assets|css|js)\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(localAssets.includes('./js/main.js'));
  for (const asset of localAssets) {
    const response = await fetch(new URL(asset, `${base}/`));
    assert.equal(response.status, 200, asset);
    // These same links must stay inside a repository subdirectory on static hosting.
    assert.ok(new URL(asset, 'https://example.com/my_web_site/').pathname.startsWith('/my_web_site/'));
  }
  const admin = await fetch(`${base}/admin/`, { redirect: 'manual' });
  assert.equal(admin.status, 302);
  assert.equal(admin.headers.get('location'), '/admin');
  assert.equal((await fetch(`${base}/admin`)).status, 200);
  for (const path of ['/.git/config', '/supabase/schema.sql', '/scripts/server.js', '/js/../package.json']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
});
