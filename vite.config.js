import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Builds dist/sw.js from src/sw.js. Vite puts a content hash in every file name, so the list of
// files the service worker should precache can't be written by hand: it is filled in here, after
// the build. The cache name changes whenever any cached file changes, which makes old caches expire.
function serviceWorker() {
  let outDir;
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  return {
    name: 'cross-walker-service-worker',
    apply: 'build',
    configResolved(config) { outDir = join(config.root, config.build.outDir); },
    closeBundle() {
      // Audio is never cached (byte-range requests), and the Web Audio fallback is 4 MB of base64.
      const skip = /\.mp3$|music-data|(^|\/)sw\.js$/;
      const files = walk(outDir).map((f) => relative(outDir, f).split(sep).join('/')).filter((f) => !skip.test(f)).sort();
      const hash = createHash('sha1');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const sw = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replace('__CACHE__', `cross-walker-${hash.digest('hex').slice(0, 10)}`)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files]));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',                       // relative URLs: works at the domain root and in a sub-folder
  plugins: [serviceWorker()],
  build: { chunkSizeWarningLimit: 5000 },   // the 4 MB music fallback is a lazy chunk on purpose
  server: { port: 8123 },
  preview: { port: 8123 },
});
