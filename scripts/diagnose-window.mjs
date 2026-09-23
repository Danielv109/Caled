import { writeFile, mkdir } from 'node:fs/promises';
const pages = await (await fetch('http://127.0.0.1:9237/json/list')).json();
const page = pages.find(item => item.type === 'page');
if (!page) throw new Error('No Caled test window is listening.');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  else if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded') console.log(JSON.stringify(message).slice(0, 6000));
});
const send = (method, params = {}) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable'); await send('Log.enable');
const state = await send('Runtime.evaluate', { expression: 'JSON.stringify({ready:document.readyState,title:document.title,text:document.body.innerText.slice(0,3000),html:document.body.innerHTML.slice(0,2000),vscode:typeof globalThis.vscode,resources:performance.getEntriesByType("resource").map(x=>({name:x.name,duration:x.duration})).slice(-12)})', returnByValue: true });
console.log(JSON.stringify(state));
const capture = await send('Page.captureScreenshot', { format: 'png' });
if (capture.result?.data) { await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/desktop-diagnostic.png', Buffer.from(capture.result.data, 'base64')); }
if (process.argv.includes('--reload')) { await send('Page.reload'); await new Promise(resolve => setTimeout(resolve, 10000)); }
ws.close();
