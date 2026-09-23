import { access, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSetting, contained, parseSettings, root, run } from './desktop.mjs';
import { archivePath, digest, downloadOllama, loadOllamaLock, verifyArchive } from './download-ollama.mjs';

const location = path.join(root, '.runtime/ollama');
const baseUrl = 'http://127.0.0.1:11434';
const defaultModel = 'qwen2.5-coder:1.5b';
const exists = file => access(file).then(() => true, () => false);
const exec = promisify(execFile);
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');

function parseLocalJson(text) {
  try { return JSON.parse(text); }
  catch { throw new Error('Local Ollama returned malformed JSON.'); }
}

function installedModels(data) {
  if (!Array.isArray(data.models)) throw new Error('Local Ollama returned an invalid model list.');
  return data.models.filter(item => item && typeof item === 'object');
}

/** Bound responses, prohibit redirects, and keep every managed request on numeric loopback. */
export async function localRequest(route, { body, timeoutMs = 5_000, maxBytes = 2_097_152, onLine, fetcher = fetch } = {}) {
  if (!['version', 'tags', 'ps', 'pull', 'generate'].includes(route)) throw new Error('Unsupported local API route.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('Local Ollama request timed out.'));
    controller.signal.addEventListener('abort', abort, { once: true });
  });
  try {
    const response = await Promise.race([fetcher(`${baseUrl}/api/${route}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), cancelled]);
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`Local Ollama returned HTTP ${response.status}.`);
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', size = 0;
    while (true) {
      const next = await Promise.race([reader.read(), cancelled]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new Error('Local Ollama response exceeded its size limit.');
      text += decoder.decode(next.value, { stream: true });
      if (onLine) {
        let end;
        while ((end = text.indexOf('\n')) !== -1) {
          const line = text.slice(0, end); text = text.slice(end + 1);
          if (line.length > 65_536) throw new Error('Local Ollama progress event exceeded its limit.');
          if (line.trim()) await onLine(parseLocalJson(line));
        }
        if (text.length > 65_536) throw new Error('Local Ollama progress event exceeded its limit.');
      }
    }
    text += decoder.decode();
    if (onLine) { if (text.trim()) await onLine(parseLocalJson(text)); return; }
    const data = parseLocalJson(text);
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.hasOwn(data, 'error')) {
      throw new Error('Local Ollama returned an invalid response.');
    }
    return data;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', abort);
    controller.abort();
    if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
}

async function available() {
  try { const data = await localRequest('version', { timeoutMs: 1_500, maxBytes: 8_192 }); return typeof data.version === 'string' ? data.version : undefined; }
  catch { return undefined; }
}

export function ownsProcess(record, actual, expectedExecutable) {
  return !!record && !!actual && Number.isSafeInteger(record.pid) && record.pid > 0
    && record.pid === actual.pid && typeof record.creation === 'string' && /^\d+$/.test(record.creation)
    && record.creation === actual.creation && typeof record.executable === 'string'
    && typeof actual.executable === 'string'
    && path.resolve(record.executable).toLowerCase() === path.resolve(expectedExecutable).toLowerCase()
    && path.resolve(actual.executable).toLowerCase() === path.resolve(expectedExecutable).toLowerCase();
}

async function processIdentity(pid) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(pid) || pid < 1) return undefined;
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$p = Get-Process -Id ${pid} -ErrorAction Stop; @{ pid = $p.Id; executable = $p.Path; creation = $p.StartTime.ToUniversalTime().Ticks.ToString() } | ConvertTo-Json -Compress`],
    { windowsHide: true, timeout: 10_000, maxBuffer: 8_192 });
    return JSON.parse(stdout.replace(/^\ufeff/, ''));
  } catch { return undefined; }
}

async function listenerPid() {
  if (process.platform !== 'win32') return undefined;
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$p = @(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction Stop | Where-Object { $_.LocalAddress -in @("127.0.0.1", "0.0.0.0", "::", "::1") } | Select-Object -ExpandProperty OwningProcess -Unique); if ($p.Count -eq 1) { $p[0] }'],
    { windowsHide: true, timeout: 10_000, maxBuffer: 8_192 });
    const pid = Number(stdout.trim());
    return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
  } catch { return undefined; }
}

async function managedIdentity() {
  const record = await readFile(path.join(location, 'server-process.json'), 'utf8').then(JSON.parse).catch(() => undefined);
  const actual = await processIdentity(record?.pid);
  if (!ownsProcess(record, actual, path.join(location, 'ollama.exe'))) return undefined;
  if (await listenerPid() !== record.pid) return undefined;
  return record;
}

/** Includes every shipped CPU runtime file, not merely ollama.exe. */
export async function verifyRuntime(workspace = root) {
  const directory = await contained(path.join(workspace, '.runtime/ollama'), workspace);
  const lock = await loadOllamaLock(workspace);
  const marker = JSON.parse(await readFile(path.join(directory, 'caled-runtime.json'), 'utf8'));
  if (marker.schemaVersion !== 2 || marker.version !== lock.version || marker.archiveSha256 !== lock.sha256
    || marker.mode !== 'cpu' || !Array.isArray(marker.files) || !marker.files.length || marker.files.length > 1_000) {
    throw new Error('Ollama runtime has missing or mismatched provenance. Run npm run ai:prepare.');
  }
  const names = new Set();
  for (const entry of marker.files) {
    if (!entry || typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.includes(':')
      || !/^(?:ollama\.exe|lib\/ollama\/[a-zA-Z0-9_.+\/-]+)$/.test(entry.path)
      || entry.path.split('/').some(part => part === '.' || part === '..' || !part)
      || names.has(entry.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('Invalid Ollama file manifest.');
    names.add(entry.path.toLowerCase());
    const file = await contained(path.join(directory, entry.path), directory);
    if ((await stat(file)).size !== entry.size || await digest(file) !== entry.sha256) {
      throw new Error(`Ollama runtime integrity check failed: ${entry.path}. Move .runtime/ollama aside, then run npm run ai:prepare.`);
    }
  }
  if (!names.has('ollama.exe') || !names.has('lib/ollama/ggml-base.dll')) throw new Error('Incomplete Ollama file manifest.');
  const binaries = async directoryPath => {
    for (const item of await readdir(directoryPath, { withFileTypes: true })) {
      const full = await contained(path.join(directoryPath, item.name), directory);
      if (item.isSymbolicLink()) throw new Error('Ollama runtime contains an unexpected link.');
      if (item.isDirectory()) await binaries(full);
      else if (/\.(?:exe|dll)$/i.test(item.name) && !names.has(path.relative(directory, full).replaceAll('\\', '/').toLowerCase())) {
        throw new Error('Ollama runtime contains a binary absent from its manifest.');
      }
    }
  };
  await binaries(directory);
  return marker;
}

async function archiveManifest(archive, directory, mode) {
  await contained(directory); await mkdir(directory, { recursive: true });
  const script = await contained(path.join(root, '.cache/verify-extract-ollama.ps1'));
  const output = await contained(path.join(directory, `manifest-${process.pid}.json`));
  await writeFile(script, `param([string]$Archive, [string]$Destination, [string]$Output, [string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base = [IO.Path]::GetFullPath($Destination).TrimEnd('\\') + '\\'
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
$files = @()
try {
 foreach ($entry in $zip.Entries) {
  if ($entry.FullName.EndsWith('/') -or $entry.FullName -match '^lib/ollama/(cuda_v12|cuda_v13|vulkan)/') { continue }
  $name = $entry.FullName.Replace('\\', '/')
  if ($name -notmatch '^(ollama\\.exe|lib/ollama/[a-zA-Z0-9_.+\\/-]+)$' -or $name.Split('/') -contains '..') { throw 'Unexpected archive entry.' }
  $target = [IO.Path]::GetFullPath([IO.Path]::Combine($base, $entry.FullName))
  if (-not $target.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive entry escaped destination.' }
  $hash = [Security.Cryptography.SHA256]::Create()
  $stream = $entry.Open()
  try { $sha = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $hash.Dispose() }
  if ($Mode -eq 'extract') {
   [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
   [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
  }
  if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-Item -LiteralPath $target).Length -ne $entry.Length -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) { throw ('Installed file differs from verified archive: ' + $name) }
  $files += @{ path = $name; size = $entry.Length; sha256 = $sha }
 }
 $files | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Output -Encoding UTF8
} finally { $zip.Dispose() }
`);
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Archive', archive, '-Destination', directory, '-Output', output, '-Mode', mode]);
    return JSON.parse((await readFile(output, 'utf8')).replace(/^\ufeff/, ''));
  } finally { await rm(output, { force: true }); }
}

export async function ensureRuntime() {
  const lock = await loadOllamaLock();
  if (await exists(path.join(location, 'ollama.exe'))) {
    const marker = await readFile(path.join(location, 'caled-runtime.json'), 'utf8').then(JSON.parse).catch(() => undefined);
    if (marker?.schemaVersion === 2) return verifyRuntime();
    // Legacy installs can be adopted only by comparison to every file in the verified cached archive.
    const archive = await contained(archivePath(lock));
    if (!await exists(archive)) throw new Error('The existing Ollama runtime has no file manifest. Its pinned cached ZIP is required to verify it offline. Move .runtime/ollama aside to prepare a fresh runtime.');
    await verifyArchive(archive, lock);
    const files = await archiveManifest(archive, location, 'verify');
    await writeJson(await contained(path.join(location, 'caled-runtime.json')), { schemaVersion: 2, version: lock.version, archiveSha256: lock.sha256, mode: 'cpu', files });
    return verifyRuntime();
  }
  const archive = await downloadOllama();
  const staging = await contained(path.join(root, '.runtime', `ollama-staging-${process.pid}-${Date.now()}`));
  const files = await archiveManifest(archive, staging, 'extract');
  await writeJson(path.join(staging, 'caled-runtime.json'), { schemaVersion: 2, version: lock.version, archiveSha256: lock.sha256, mode: 'cpu', files });
  if (await exists(location)) throw new Error(`Existing incomplete Ollama folder must be moved aside. Verified runtime is staged at ${staging}.`);
  await rename(staging, location);
  return verifyRuntime();
}

export async function startLocalAI() {
  if (await available()) {
    if (await managedIdentity()) console.log('Caled local Ollama is already running from this workspace.');
    else console.warn('Port 11434 has an external or relocated Ollama server. Caled did not start or take ownership of it. Its model directory and cloud policy may differ. Use ai:status to inspect it; close that server before starting this workspace runtime.');
    return false;
  }
  await ensureRuntime();
  const executable = await contained(path.join(location, 'ollama.exe'));
  const models = await contained(path.join(root, '.runtime/models'));
  await mkdir(models, { recursive: true });
  const log = await open(await contained(path.join(location, 'server.log')), 'a');
  let child, record, started = false, exited = false;
  try {
    child = spawn(executable, ['serve'], { cwd: location, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MODELS: models, OLLAMA_NO_CLOUD: '1', OLLAMA_CONTEXT_LENGTH: '8192', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_KEEP_ALIVE: '2m', OLLAMA_NOHISTORY: '1', OLLAMA_ORIGINS: '' } });
    child.on('exit', () => { exited = true; });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    await log.close();
    record = await processIdentity(child.pid);
    if (!record || record.executable.toLowerCase() !== executable.toLowerCase()) throw new Error('Could not verify the started Ollama process identity.');
    for (let attempt = 0; attempt < 40; attempt++) {
      if (exited) throw new Error('The local Ollama server exited during startup.');
      if (await available() && await listenerPid() === child.pid) {
        await writeJson(await contained(path.join(location, 'server-process.json')), record);
        started = true; child.unref();
        console.log('Ollama local ready on 127.0.0.1:11434 (cloud disabled; models in this workspace).');
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Ollama did not start. See ${location}/server.log`);
  } finally {
    await log.close().catch(() => undefined);
    // This handle refers only to the child created in this call; never kill a reused/foreign PID.
    if (!started && child && !exited) child.kill();
  }
}

export async function stopLocalAI() {
  const record = await managedIdentity();
  if (!record) throw new Error('No owned Ollama process with matching executable, creation identity and listening port. An external or relocated server will not be stopped.');
  // Get-Process again immediately before Stop-Process, so a recycled PID cannot target another app.
  const script = `$p = Get-Process -Id ${record.pid} -ErrorAction Stop; if ($p.Path -ne $env:CALED_OWNED_EXE -or $p.StartTime.ToUniversalTime().Ticks.ToString() -ne $env:CALED_OWNED_CREATION) { throw 'Process identity changed; refusing to stop.' }; $p | Stop-Process -ErrorAction Stop`;
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10_000, env: { ...process.env, CALED_OWNED_EXE: record.executable, CALED_OWNED_CREATION: record.creation } });
  await rm(await contained(path.join(location, 'server-process.json')), { force: true });
  console.log('Stopped the Ollama server owned by this Caled workspace.');
}

export async function localStatus() {
  const version = await available();
  if (!version) return { status: 'not running', endpoint: baseUrl, next: 'npm run ai:start' };
  const owned = await managedIdentity();
  const identity = owned ?? await processIdentity(await listenerPid());
  const tags = await localRequest('tags');
  return { status: owned ? 'managed' : 'external', endpoint: baseUrl, version,
    ...(identity ? { executable: identity.executable, pid: identity.pid } : {}),
    models: installedModels(tags).map(item => item.name).filter(item => typeof item === 'string'),
    ...(!owned ? { note: 'This server is not owned by this workspace; no process or model mutation is allowed by the managed scripts.' } : {}) };
}

export async function prepare(model = defaultModel) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The managed local runtime currently supports Windows x64.');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,200}$/.test(model) || /cloud/i.test(model)) throw new Error('Choose a local Ollama model identifier.');
  await ensureRuntime();
  await startLocalAI();
  if (!await managedIdentity()) throw new Error('Model preparation refused: port 11434 belongs to an external or relocated Ollama server. Close it and run npm run ai:prepare again.');
  let tags = await localRequest('tags');
  let installed = installedModels(tags).find(item => item.name === model || item.model === model);
  if (!installed) {
    console.log(`Preparing local model ${model}...`);
    let previous = '', success = false;
    await localRequest('pull', { body: { model, stream: true }, timeoutMs: 900_000, maxBytes: 16_777_216, onLine(event) {
      if (!event || typeof event !== 'object' || Object.hasOwn(event, 'error')) throw new Error('Ollama model download failed.');
      if (typeof event.status !== 'string') throw new Error('Invalid Ollama progress response.');
      const progress = event.total ? `${event.status}: ${Math.floor((event.completed || 0) / event.total * 10) * 10}%` : event.status;
      if (progress !== previous) { console.log(progress.slice(0, 256)); previous = progress; }
      if (event.status === 'success') success = true;
    } });
    if (!success) throw new Error('Model download ended without a success acknowledgement.');
    tags = await localRequest('tags');
    installed = installedModels(tags).find(item => item.name === model || item.model === model);
  }
  if (!installed) throw new Error('The selected model was not found in managed Ollama.');
  await writeJson(await contained(path.join(location, 'selected-model.json')), { model, digest: installed.digest, size: installed.size, prepared: new Date().toISOString() });
  const settingsFile = await contained(path.join(root, '.runtime/Caled/data/user-data/User/settings.json'));
  if (await exists(settingsFile)) {
    const text = await readFile(settingsFile, 'utf8');
    const settings = parseSettings(text).value;
    if ((!settings['caled.provider'] || settings['caled.provider'] === 'ollama') && !Object.hasOwn(settings, 'caled.model')) {
      // Re-read before writing to avoid overwriting an edit made during preparation.
      if (await readFile(settingsFile, 'utf8') !== text) throw new Error('Settings changed during model preparation; select the model in Caled manually.');
      await writeFile(settingsFile, addSetting(text, 'caled.model', model));
    }
  }
  console.log(`Local model ready: ${model}. Existing installed models are reused without a network download.`);
}

async function releaseMemory() {
  if (!await managedIdentity()) throw new Error('Refusing to unload models on an external or relocated Ollama server.');
  const { model } = JSON.parse(await readFile(path.join(location, 'selected-model.json'), 'utf8'));
  await localRequest('generate', { body: { model, keep_alive: 0, stream: false }, timeoutMs: 15_000 });
  console.log('Model unloaded; the local server stays available.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actions = { prepare: () => prepare(process.argv[3] || defaultModel), start: startLocalAI, stop: stopLocalAI,
    status: async () => console.log(JSON.stringify(await localStatus(), null, 2)), verify: async () => { await verifyRuntime(); console.log('Ollama runtime file integrity verified.'); }, unload: releaseMemory };
  try {
    const action = actions[process.argv[2]];
    if (!action) throw new Error('Usage: node scripts/local-ai.mjs prepare [model] | start | stop | status | verify | unload');
    await action();
  } catch (error) { console.error(`Caled local AI: ${error.message}`); process.exitCode = 1; }
}
