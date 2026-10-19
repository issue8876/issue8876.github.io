import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, 'functions/runtime');
await mkdir(path.join(runtime, 'js'), { recursive: true });
await cp(path.join(root, 'server'), path.join(runtime, 'server'), { recursive: true });
await cp(path.join(root, 'js/maeumgil-core.js'), path.join(runtime, 'js/maeumgil-core.js'));
const packageFile = path.join(root, 'functions/package.json');
await readFile(packageFile); // Fail before deployment if dependencies are missing.
await writeFile(path.join(runtime, 'package.json'), '{"type":"module"}\n');
console.log('Firebase Functions runtime prepared (server and core only; no .env or research data)');
