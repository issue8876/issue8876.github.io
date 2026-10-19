import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('short Hosting domain serves the app at root with working assets, API rewrites and legacy redirects', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  execFileSync(process.execPath, ['scripts/build-pages.mjs', '--firebase'], { cwd: root });
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>마음쉼<\/title>/);
  assert.match(html, /src="\/js\/maeumgil\.js\?/);
  assert.match(html, /href="\/css\/maeumgil\.css\?/);
  assert.match(html, /href="\/" aria-label="마음쉼 처음 화면"/);
  assert.ok(!/(?:src|href)="\.\.\//.test(html));
  const config = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
  const current = config.hosting.find(site => site.site === 'maeum');
  const legacy = config.hosting.find(site => site.site === 'maeum-835b3');
  assert.ok(!current.redirects.some(rule => rule.source === '/'));
  assert.equal(current.redirects.find(rule => rule.source === '/pages/maeum.html').destination, '/');
  assert.equal(current.rewrites.find(rule => rule.source === '/api/**').function.functionId, 'coachApi');
  assert.equal(legacy.redirects.find(rule => rule.source === '/pages/maeum.html').destination, 'https://maeum.web.app/');
});
