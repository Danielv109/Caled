import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, contained, run } from './desktop.mjs';

const lock = JSON.parse(await readFile(path.join(root, 'product/language-pack.lock.json'), 'utf8'));
if (lock.id !== 'MS-CEINTL.vscode-language-pack-es' || !/^\d+\.\d+\.\d+$/.test(lock.version) || !/^[a-f0-9]{64}$/.test(lock.sha256)
  || lock.url !== `https://open-vsx.org/api/MS-CEINTL/vscode-language-pack-es/${lock.version}/file/MS-CEINTL.vscode-language-pack-es-${lock.version}.vsix`) throw new Error('Invalid language pack lock.');
const runtime = path.join(root, '.runtime/Caled');
const extensions = await contained(path.join(runtime, 'data/extensions'));
await mkdir(extensions, { recursive: true });
const names = await readdir(extensions);
let installed = false;
for (const name of names.filter(name => name.toLowerCase().startsWith('ms-ceintl.vscode-language-pack-es-'))) {
  const manifest = await readFile(path.join(extensions, name, 'package.json'), 'utf8').then(JSON.parse).catch(() => undefined);
  if (manifest?.version === lock.version && manifest.name === 'vscode-language-pack-es' && manifest.publisher === 'MS-CEINTL') installed = true;
}
if (installed) { console.log(`Spanish editor language pack ${lock.version} is installed.`); }
else {
  const archive = await contained(path.join(root, '.cache', `language-es-${lock.version}.vsix`));
  await mkdir(path.dirname(archive), { recursive: true });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const cached = await readFile(archive).catch(() => undefined);
  if (!cached || hash(cached) !== lock.sha256) {
    const response = await fetch(lock.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error('Spanish language pack download failed.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw new Error('Language pack exceeds its download budget.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (hash(bytes) !== lock.sha256) throw new Error('Spanish language pack checksum mismatch.');
    const temp = `${archive}.${process.pid}.tmp`;
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, archive);
  }
  const release = JSON.parse(await readFile(path.join(root, 'product/upstream.lock.json'), 'utf8'));
  const executable = await contained(path.join(runtime, release.executable));
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_PORTABLE: path.join(runtime, 'data') };
  delete env.NODE_OPTIONS; delete env.VSCODE_DEV;
  await run(executable, [path.join(runtime, 'resources/app/out/cli.js'), '--install-extension', archive, '--force'], { env });
  console.log(`Spanish editor language pack ${lock.version} installed from checksum-verified Open VSX archive.`);
}
