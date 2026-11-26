import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';

const watch = process.argv.includes('--watch');

/**
Firefox runs the background script as an event page and needs an add-on ID.
@param {Record<string, unknown>} base
@returns {Record<string, unknown>}
*/
function firefoxManifest(base) {
  const manifest = { ...base };
  delete manifest['minimum_chrome_version'];
  return {
    ...manifest,
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: {
        id: 'voran@voran',
        // First version (ESR 140) that knows data_collection_permissions.
        strict_min_version: '140.0',
        // Selected page text is sent to Anthropic.
        data_collection_permissions: { required: ['websiteContent'] },
      },
    },
  };
}

/**
@typedef {object} Target
@property {string} name
@property {string} esbuildTarget
@property {(base: Record<string, unknown>) => Record<string, unknown>} manifest
*/

/**
@type {Target[]}
*/
const targets = [
  { name: 'chrome', esbuildTarget: 'chrome120', manifest: (base) => base },
  { name: 'firefox', esbuildTarget: 'firefox140', manifest: firefoxManifest },
];

/**
@param {Target} target
@returns {import('esbuild').BuildOptions}
*/
function options(target) {
  return {
    entryPoints: {
      background: 'src/background.ts',
      content: 'src/content.ts',
      options: 'src/options.ts',
    },
    outdir: `dist/${target.name}`,
    bundle: true,
    format: 'iife',
    target: target.esbuildTarget,
    sourcemap: true,
    logLevel: 'info',
  };
}

/**
@param {Target} target
*/
async function copyStatic(target) {
  const outdir = `dist/${target.name}`;
  await mkdir(outdir, { recursive: true });
  /**
  @type {Record<string, unknown>}
  */
  const base = JSON.parse(await readFile('manifest.json', 'utf8'));
  await writeFile(`${outdir}/manifest.json`, `${JSON.stringify(target.manifest(base), null, 2)}\n`);
  await cp('src/options.html', `${outdir}/options.html`);
}

await rm('dist', { recursive: true, force: true });
for (const target of targets) {
  await copyStatic(target);
}

if (watch) {
  for (const target of targets) {
    const watcher = await context(options(target));
    await watcher.watch();
  }
} else {
  await Promise.all(targets.map((target) => build(options(target))));
}
