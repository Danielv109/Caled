import { build } from 'esbuild';
import { createRequire } from 'node:module';
await build({ entryPoints: ['tests/live-inference.ts'], outfile: 'artifacts/live-inference.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
const require = createRequire(import.meta.url);
await require('../artifacts/live-inference.cjs').runLiveInference();
