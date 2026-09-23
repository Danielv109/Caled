import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { root, verify } from './desktop.mjs';
const { runtime } = await verify();
const lock = JSON.parse(await readFile(path.join(root, 'product/upstream.lock.json'), 'utf8'));
const directory = path.join(root, 'artifacts', `desktop-test-${Date.now()}`);
const fixture = path.join(directory, 'workspace');
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, 'sum.ts'), 'export function sum(a: number, b: number) {\n  return a - b;\n}\n');
await writeFile(path.join(fixture, '.env'), 'TOKEN=CALED_SECRET_DO_NOT_SEND');
const resultFile = path.join(directory, 'result.json');
const env = { ...process.env, CALED_TEST_RESULT: resultFile };
if (process.argv.includes('--capture')) env.CALED_TEST_CAPTURE = '1';
const live = process.argv.includes('--live');
if (live) env.CALED_LIVE_MODEL = JSON.parse(await readFile(path.join(root, '.runtime/ollama/selected-model.json'), 'utf8')).model;
delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_PORTABLE; delete env.VSCODE_DEV;
// A portable installation ignores --user-data-dir unless its portable location is explicit.
env.VSCODE_PORTABLE = path.join(directory, 'portable');
await mkdir(path.join(env.VSCODE_PORTABLE, 'user-data', 'User'), { recursive: true });
await writeFile(path.join(env.VSCODE_PORTABLE, 'user-data', 'User', 'settings.json'), await readFile(path.join(root, 'product/settings.defaults.json')));
const child = spawn(path.join(runtime, lock.executable), [fixture, '--user-data-dir', path.join(directory, 'profile'), '--extensions-dir', path.join(directory, 'extensions'), '--extensionDevelopmentPath', root, '--extensionTestsPath', path.join(root, live ? 'tests/integration/live-suite.cjs' : 'tests/integration/suite.cjs'), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-gpu', ...(env.CALED_TEST_CAPTURE ? ['--remote-debugging-port=9237'] : []), '--new-window'], { cwd: root, env, windowsHide: true, stdio: 'pipe' });
let logs = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { logs += data.toString(); });
const timer = setTimeout(() => {
  if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill();
}, 90000);
const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
clearTimeout(timer);
await writeFile(path.join(directory, 'desktop.log'), logs);
let result;
try { result = JSON.parse(await readFile(resultFile, 'utf8')); } catch { throw new Error(`Desktop test exited ${code} without results. See ${directory}/desktop.log\n${logs.slice(-4000)}`); }
console.log(JSON.stringify(result, null, 2));
if (!result.passed || code !== 0) process.exitCode = 1;
