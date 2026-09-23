import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Reproducible index-only benchmark. It does not measure Electron, Ollama or Cursor.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const boundary = path.join(project, 'artifacts', 'benchmark-index');
await mkdir(boundary, { recursive: true });
const workspace = await mkdtemp(path.join(boundary, 'run-'));
const root = path.join(workspace, 'source'), storagePath = path.join(workspace, '.cache');
const files = 1000, changedFiles = 10;
let sourceBytes = 0;
try {
  await mkdir(root);
  for (let group = 0; group < 20; group++) {
    const directory = path.join(root, `module${String(group).padStart(2, '0')}`);
    await mkdir(directory);
    await Promise.all(Array.from({ length: files / 20 }, async (_, offset) => {
      const id = group * 50 + offset;
      const content = Array.from({ length: 18 }, (_, method) => [
        `/** Validates account ${id} operation ${method}. */`,
        `export function validateAccount${id}Operation${method}(token: string, balance: number): boolean {`,
        `  const minimum = ${method + 2};`,
        '  return token.length >= minimum && Number.isFinite(balance) && balance >= 0;',
        '}',
      ].join('\n')).join('\n\n');
      sourceBytes += Buffer.byteLength(content);
      await writeFile(path.join(directory, `account${String(id).padStart(4, '0')}.ts`), content);
    }));
  }
  const library = path.join(workspace, 'local-index.cjs');
  await build({ entryPoints: [path.join(project, 'src/index/local-index.ts')], outfile: library, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['node:sqlite'] });
  const runner = path.join(workspace, 'runner.cjs');
  await writeFile(runner, String.raw`
const { LocalIndex } = require('./local-index.cjs');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const [mode, root, storagePath] = process.argv.slice(2);
const index = new LocalIndex();
const measurements = [];
const round = n => Math.round(n * 100) / 100;
async function measure(name) {
  global.gc?.();
  const before = process.memoryUsage();
  let peakRss = before.rss, peakHeap = before.heapUsed;
  const sample = () => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); };
  const sampler = setInterval(sample, 5);
  try {
    const start = performance.now();
    const stats = await index.scan({ root, storagePath, maxFiles: 2500 });
    const wallMs = performance.now() - start;
    sample();
    const after = process.memoryUsage();
    const searches = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      const snippets = await index.search('validate account token balance operation' + i, 18000);
      if (!snippets.length) throw new Error('Benchmark returned no search results.');
      searches.push(performance.now() - start);
    }
    sample(); searches.sort((a, b) => a - b);
    measurements.push({ name, wallMs: round(wallMs), stats, searchP50Ms: round(searches[15]), searchP95Ms: round(searches[28]), memoryBytes: { before, after, sampledPeakRss: peakRss, sampledPeakHeapUsed: peakHeap, processPeakRss: process.resourceUsage().maxRSS * 1024 } });
  } finally { clearInterval(sampler); }
}
(async () => {
  try {
    await measure(mode === 'cold' ? 'cold' : 'restartFromSqlite');
    if (mode === 'warm') {
      await measure('unchangedInMemory');
      for (let i = 0; i < 10; i++) await writeFile(path.join(root, 'module00', 'account' + String(i).padStart(4, '0') + '.ts'), 'export function updatedAccount' + i + '(token: string) { return token.length > 8; }');
      await measure('tenChangedFiles');
    }
    process.stdout.write(JSON.stringify(measurements));
  } finally { index.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
`);
  const run = mode => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--expose-gc', runner, mode, root, storagePath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) reject(new Error(`Benchmark process failed (${code}): ${stderr.slice(-4000)}`));
      else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } }
    });
  });
  const cold = await run('cold'), warm = await run('warm');
  if (cold[0].stats.readFiles !== files || warm[0].stats.readFiles !== 0 || warm[1].stats.readFiles !== 0 || warm[2].stats.readFiles !== changedFiles) throw new Error('Incremental index regression: unexpected source read counts.');
  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'Synthetic local context index only; excludes editor and AI model memory. No comparison with Cursor.',
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
    dataset: { files, changedFiles, sourceBytes, linesPerFile: 107 },
    measurements: [...cold, ...warm],
  };
  const output = path.join(project, 'artifacts', 'index-benchmark.json');
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  const resolved = path.resolve(workspace);
  if (resolved.startsWith(path.resolve(boundary) + path.sep)) await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
