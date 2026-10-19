import { cp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Only public frontend paths are copied. In particular, never copy .env or server/.
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
const entries = ['index.html', 'pages', 'css', 'js', 'assets'];
for (const name of entries) await cp(path.join(root, name), path.join(dist, name), { recursive: true });
const firebase = process.argv.includes('--firebase');
const firebaseStatic = process.argv.includes('--firebase-static');
const raw = firebase || firebaseStatic ? '' : process.env.PUBLIC_API_BASE_URL || '';
if (raw) { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PUBLIC_API_BASE_URL must be an HTTPS origin, without credentials or path.'); }
await writeFile(path.join(dist, 'js/maeumgil-config.js'), `export const config = Object.freeze({apiBase:${JSON.stringify(raw.replace(/\/$/, ''))},firebase:${firebase}});\n`);
if (firebase || firebaseStatic) {
  const page = path.join(dist, 'pages/maeum.html');
  const html = await readFile(page, 'utf8');
  const appHtml = html.replace(/\s*<link rel="canonical"[^>]+>/, '');
  await writeFile(page, appHtml);
  if (firebase) {
    // Serve the app at the domain root; GitHub's portfolio index stays unchanged.
    const rootHtml = appHtml.replace(/(href|src)="\.\.\//g, '$1="/')
      .replace('href="maeum.html"', 'href="/"').replace('href="/index.html"', 'href="/"');
    await writeFile(path.join(dist, 'index.html'), rootHtml);
  }
}
await writeFile(path.join(dist, '.nojekyll'), '');
async function audit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name !== '.nojekyll' && (entry.name.startsWith('.') || /(?:server|node_modules|tests)/.test(entry.name))) throw new Error(`Unexpected deployment file: ${entry.name}`);
    const name = path.join(dir, entry.name); if (entry.isDirectory()) await audit(name);
    else {
      const data = await readFile(name);
      if (path.extname(name) === '.woff2') {
        if (data.subarray(0, 4).toString('ascii') !== 'wOF2') throw new Error('Invalid WOFF2 font.');
        continue;
      }
      const content = data.toString('utf8');
      if (/AIza[\w-]{30,}|-----BEGIN .*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(content)) throw new Error('Possible secret found in public build.');
    }
  }
}
await audit(dist); console.log('Pages build ready: dist/ (frontend only; secret scan passed)');
