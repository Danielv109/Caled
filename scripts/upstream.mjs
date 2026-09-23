import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { brandProduct, bundleExtension, contained, root, run } from './desktop.mjs';

const exec = promisify(execFile);
const source = path.join(root, '.upstream', 'vscode');
const exists = (file) => access(file).then(() => true, () => false);

async function prepare() {
  const lock = JSON.parse(await readFile(path.join(root, 'product', 'upstream.lock.json'), 'utf8'));
  if (lock.source.repository !== 'https://github.com/microsoft/vscode.git' || !/^[a-f0-9]{40}$/.test(lock.source.commit)) throw new Error('Invalid pinned source.');
  await contained(source);
  await mkdir(path.dirname(source), { recursive: true });
  if (!(await exists(source))) {
    await run('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth=1', '--branch', lock.source.tag, lock.source.repository, source]);
    await run('git', ['checkout', '--detach', lock.source.commit], { cwd: source });
  }
  const revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: source, windowsHide: true })).stdout.trim();
  if (revision !== lock.source.commit) throw new Error(`Existing source is at ${revision}; expected ${lock.source.commit}. No files changed.`);
  // Overlay writes are repeatable, but don't silently replace edits to product.json.
  const sourceProduct = path.join(source, 'product.json');
  const marker = path.join(source, '.caled-overlay.json');
  const current = await readFile(sourceProduct, 'utf8');
  const tracked = (await exec('git', ['show', 'HEAD:product.json'], { cwd: source, windowsHide: true })).stdout;
  const previous = await readFile(marker, 'utf8').then(JSON.parse, () => null);
  const normalize = (value) => value.replace(/\r\n/g, '\n').trim();
  if (normalize(current) !== normalize(tracked) && current !== previous?.product) throw new Error('Local changes to upstream product.json detected. Review them before applying the overlay.');
  await bundleExtension(path.join(source, 'extensions', 'caled'));
  // Reapply from pristine metadata after confirming no user edits would be lost.
  await writeFile(sourceProduct, tracked);
  await brandProduct(sourceProduct);
  await writeFile(marker, `${JSON.stringify({ sourceCommit: revision, product: await readFile(sourceProduct, 'utf8') }, null, 2)}\n`);
  const nodeVersion = (await readFile(path.join(source, '.nvmrc'), 'utf8')).trim();
  console.log(`Code-OSS ${lock.source.tag} prepared at ${source}\nPinned commit: ${revision}\nRequired Node: ${nodeVersion}\nNext: install this Node version and Windows C++/Python prerequisites, then npm install and npm run watch in the source directory. See docs/distribution.md.`);
}

try {
  if (process.argv[2] !== 'prepare') throw new Error('Usage: node scripts/upstream.mjs prepare');
  await prepare();
} catch (error) {
  console.error(`Caled source: ${error.message}`);
  process.exitCode = 1;
}
