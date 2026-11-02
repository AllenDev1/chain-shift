// Assembles www/, the bundle Capacitor copies into the iOS and Android apps: the game's
// static files as they are, plus Capacitor's runtime (the web version doesn't load it).
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'www');

await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const f of ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons']) {
  await cp(join(root, f), join(out, f), { recursive: true });
}
await cp(join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), join(out, 'capacitor.js'));

// A classic script runs before deferred module scripts, so window.Capacitor exists by the
// time js/native.js is evaluated.
const tag = '<script type="module" src="js/main.js"></script>';
const html = await readFile(join(out, 'index.html'), 'utf8');
if (!html.includes(tag)) throw new Error(`index.html no longer contains ${tag}`);
await writeFile(join(out, 'index.html'), html.replace(tag, `<script src="capacitor.js"></script>\n  ${tag}`));

console.log('www/ ready');
