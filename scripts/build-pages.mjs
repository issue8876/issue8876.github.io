import { cp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Only public frontend paths are copied. In particular, never copy .env or server/.
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
const entries = ['index.html', 'pages', 'css', 'js'];
for (const name of entries) await cp(path.join(root, name), path.join(dist, name), { recursive: true });
const raw = process.env.PUBLIC_API_BASE_URL || '';
if (raw) { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PUBLIC_API_BASE_URL must be an HTTPS origin, without credentials or path.'); }
await writeFile(path.join(dist, 'js/maeumgil-config.js'), `export const config = Object.freeze({apiBase:${JSON.stringify(raw.replace(/\/$/, ''))}});\n`);
await writeFile(path.join(dist, '.nojekyll'), '');
async function audit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name !== '.nojekyll' && (entry.name.startsWith('.') || /(?:server|node_modules|tests)/.test(entry.name))) throw new Error(`Unexpected deployment file: ${entry.name}`);
    const name = path.join(dir, entry.name); if (entry.isDirectory()) await audit(name);
    else { const content = await readFile(name, 'utf8'); if (/AIza[\w-]{30,}|-----BEGIN .*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(content)) throw new Error('Possible secret found in public build.'); }
  }
}
await audit(dist); console.log('Pages build ready: dist/ (frontend only; secret scan passed)');
