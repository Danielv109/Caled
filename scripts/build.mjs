import { build, context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const options = { entryPoints: { extension: 'src/extension.ts', 'index-worker': 'src/index/worker.ts' }, outdir: 'dist', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['vscode', 'node:sqlite'], sourcemap: true, minify: false, logLevel: 'info' };
if (process.argv.includes('--watch')) { const ctx = await context(options); await ctx.watch(); } else { await build(options); }
