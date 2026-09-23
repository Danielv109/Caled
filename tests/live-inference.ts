import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { listModels, streamChat, type ProviderConfig } from '../src/core/provider';
import { EDIT_SYSTEM_PROMPT, parseProposal, prepareProposal } from '../src/core/edits';

export async function runLiveInference(): Promise<void> {
  const model = JSON.parse(await readFile('.runtime/ollama/selected-model.json', 'utf8')).model as string;
  const config: ProviderConfig = { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model, timeoutMs: 120000, maxTokens: 256, temperature: 0 };
  const names = await listModels(config);
  assert.ok(names.includes(model));
  const started = performance.now();
  let response = '', firstTokenMs = 0;
  for await (const chunk of streamChat(config, [{ role: 'system', content: 'Return only TypeScript code, without Markdown.' }, { role: 'user', content: 'Write function sum(a: number, b: number): number that returns a + b.' }])) { if (!response) firstTokenMs = performance.now() - started; response += chunk; }
  assert.match(response, /a\s*\+\s*b/);
  const chatMs = performance.now() - started;
  const fixture = path.resolve('artifacts/live-fixture');
  await mkdir(fixture, { recursive: true });
  const source = 'export function sum(a: number, b: number) {\n  return a - b;\n}\n';
  await writeFile(path.join(fixture, 'sum.ts'), source);
  let editResponse = '';
  const editStarted = performance.now();
  for await (const chunk of streamChat({ ...config, maxTokens: 512 }, [{ role: 'system', content: EDIT_SYSTEM_PROMPT }, { role: 'user', content: `Contexto del proyecto:\n<active-file path="sum.ts" startLine="1">\n${source}</active-file>\nSolicitud: Corrige la función para sumar. La única ruta existente es sum.ts, en la raíz (no existe carpeta src). En edits usa path exactamente "sum.ts", oldText exactamente "return a - b;" y newText "return a + b;". Devuelve JSON.` }])) editResponse += chunk;
  await writeFile('artifacts/live-inference-response.json', JSON.stringify({ model, chat: response, composer: editResponse }, null, 2));
  const files = await prepareProposal(fixture, parseProposal(editResponse));
  assert.ok(files.some(file => /return a\s*\+\s*b;/.test(file.after)));
  assert.equal(await readFile(path.join(fixture, 'sum.ts'), 'utf8'), source);
  const result = { passed: true, model, provider: 'Ollama local CPU', chat: { firstTokenMs: Math.round(firstTokenMs), totalMs: Math.round(chatMs), response }, composer: { totalMs: Math.round(performance.now() - editStarted), response: editResponse, files: files.map(file => file.path) }, note: 'Single smoke test, not a quality or performance benchmark against Cursor.' };
  await writeFile('artifacts/live-inference.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
