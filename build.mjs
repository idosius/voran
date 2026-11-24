import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import process from 'node:process';

const watch = process.argv.includes('--watch');

/**
@type {import('esbuild').BuildOptions}
*/
const options = {
  entryPoints: {
    background: 'src/background.ts',
    content: 'src/content.ts',
    options: 'src/options.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
};

async function copyStatic() {
  await cp('manifest.json', 'dist/manifest.json');
  await cp('src/options.html', 'dist/options.html');
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyStatic();

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
