// Inspect only the isolated test window started with test-desktop.mjs --capture.
import { mkdir, writeFile } from 'node:fs/promises';
const endpoint = 'http://127.0.0.1:9237';
const version = await (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
const requests = new Map();
const contexts = [];
let sequence = 0;
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = requests.get(message.id);
    if (request) { clearTimeout(request.timer); requests.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  } else if (message.method === 'Runtime.executionContextCreated') contexts.push({ sessionId: message.sessionId, contextId: message.params.context.id });
});
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Timed out: ${method}`)); }, 4000);
  requests.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const evaluate = (context, expression) => call('Runtime.evaluate', { expression, contextId: context.contextId, returnByValue: true }, context.sessionId);
try {
  const { targetInfos } = await call('Target.getTargets');
  const page = targetInfos.find(target => target.type === 'page' && target.title.includes('[Extension Development Host]'));
  if (!page) throw new Error('Refusing capture: the isolated test window was not found.');
  let pageSession;
  for (const target of targetInfos.filter(target => target.targetId === page.targetId || (target.type === 'iframe' && target.url.startsWith('vscode-webview:')))) {
    const { sessionId } = await call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    if (target.targetId === page.targetId) pageSession = sessionId;
    await call('Runtime.enable', {}, sessionId);
  }
  let studio;
  for (const context of contexts) {
    try {
      const probe = await evaluate(context, "Boolean(document.getElementById('brief-form') && document.getElementById('tab-home'))");
      if (probe.result?.value === true) { studio = context; break; }
    } catch { /* A context can disappear while a webview is loading. */ }
  }
  if (!studio) throw new Error('Studio tab controls were not found in the test window.');
  const variant = process.argv.includes('--light') ? 'light' : 'dark';
  await mkdir('artifacts', { recursive: true });
  for (const [section, labels] of [['home', ['Inicio', 'Home']], ['project', ['Proyecto', 'Project']], ['space', ['Mi espacio', 'My space']]]) {
    const result = await evaluate(studio, `(() => { const labels = ${JSON.stringify(labels)}; const tab = [...document.querySelectorAll('[role=tab]')].find(button => labels.includes(button.textContent.trim())); if (!tab) return false; tab.click(); return true; })()`);
    if (!result.result?.value) throw new Error(`Missing studio section: ${section}`);
    await new Promise(resolve => setTimeout(resolve, 180));
    const capture = await call('Page.captureScreenshot', { format: 'png' }, pageSession);
    const file = `artifacts/studio-${variant}-${section}.png`;
    await writeFile(file, Buffer.from(capture.data, 'base64'));
    console.log(file);
  }
  const overflow = await evaluate(studio, 'document.documentElement.scrollWidth > document.documentElement.clientWidth + 2');
  if (overflow.result?.value) throw new Error('The studio overflows horizontally.');
} finally { ws.close(); }
