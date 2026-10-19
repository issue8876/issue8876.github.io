import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { hostedConnectionUrl } from '../js/maeumgil-connection.js';

test('static AI entry goes to the trusted host without forwarding local paths or credentials', () => {
  const hosted = 'https://maeum.web.app/?connect=1';
  const plain = { apiBase: '' };
  assert.equal(hostedConnectionUrl(new URL('file:///C:/private/maeum.html?code=private'), plain), hosted);
  assert.equal(hostedConnectionUrl(new URL('https://issue8876.github.io/pages/maeum.html?code=private'), plain), hosted);
  assert.equal(hostedConnectionUrl(new URL(hosted), { apiBase: '', firebase: true }), null);
  assert.equal(hostedConnectionUrl(new URL('http://127.0.0.1:8792/pages/maeum.html'), plain), null);
  assert.equal(hostedConnectionUrl(new URL('https://school.example/pages/maeum.html'), { apiBase: 'https://api.example' }), null);
});

test('local HTML redirects before ES modules run, while hosted and development pages stay put', async () => {
  const html = await readFile(new URL('../pages/maeum.html', import.meta.url), 'utf8');
  const boot = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(boot);
  assert.ok(html.indexOf('<script>') < html.indexOf('type="module"'));
  for (const protocol of ['file:', 'https:', 'http:']) {
    const redirects = [];
    runInNewContext(boot, { location: { protocol, replace: url => redirects.push(url) } });
    assert.deepEqual(redirects, protocol === 'file:' ? ['https://maeum.web.app/?connect=1'] : []);
  }
});
