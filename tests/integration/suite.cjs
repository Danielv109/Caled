const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
  const requests = [];
  let mode = 'chat';
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    if (req.url === '/api/tags') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ models: [{ name: 'caled-test-model' }] })); return; }
    if (req.url !== '/api/chat') { res.writeHead(404); res.end(); return; }
    const body = JSON.parse(Buffer.concat(parts).toString()); requests.push(body);
    res.setHeader('Content-Type', 'application/x-ndjson');
    if (mode === 'slow') { res.write(JSON.stringify({ message: { content: 'Partial' }, done: false }) + '\n'); req.on('close', () => res.end()); return; }
    const content = mode === 'edit' ? JSON.stringify({ summary: 'Corrige suma', edits: [{ path: 'sum.ts', oldText: 'return a - b;', newText: 'return a + b;' }] }) : mode === 'inline' ? 'return a + b;' : 'La función sum está en sum.ts. Recibe dos números.';
    for (const text of [content.slice(0, 8), content.slice(8)]) res.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
    res.end(JSON.stringify({ message: { content: '' }, done: true }) + '\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const checks = [];
  try {
    assert.ok(vscode.workspace.isTrusted, 'Fixture must be trusted');
    const config = vscode.workspace.getConfiguration('caled');
    await config.update('provider', 'ollama', vscode.ConfigurationTarget.Global);
    await config.update('baseUrl', `http://127.0.0.1:${server.address().port}`, vscode.ConfigurationTarget.Global);
    await config.update('model', 'caled-test-model', vscode.ConfigurationTarget.Global);
    await config.update('inline.enabled', false, vscode.ConfigurationTarget.Global);
    const extension = vscode.extensions.getExtension('caled.caled');
    assert.ok(extension, 'Caled extension discovered');
    const api = await extension.activate();
    assert.equal(api.ready, true); assert.ok(api.testing); checks.push('extension activated in actual desktop');
    const commands = await vscode.commands.getCommands(true);
    for (const cmd of ['caled.open', 'caled.configure', 'caled.edit', 'caled.reindex']) assert.ok(commands.includes(cmd), cmd);
    checks.push('commands registered');
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'sum.ts')));
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 2, 1);
    await vscode.commands.executeCommand('caled.open');
    await vscode.commands.executeCommand('caled.reindex');
    assert.ok(api.testing.stats().indexedFiles >= 1); checks.push('worker index operational');
    await api.testing.send('Explica sum', 'chat');
    assert.equal(requests.length, 1); assert.ok(requests[0].messages.at(-1).content.includes('return a - b;'));
    assert.ok(!JSON.stringify(requests).includes('CALED_SECRET_DO_NOT_SEND'));
    assert.equal(api.testing.stats().history, 2); checks.push('streamed chat with workspace context and excluded secrets');
    mode = 'edit';
    await api.testing.send('Corrige sum', 'edit');
    let proposal = api.testing.proposals().at(-1);
    assert.ok(proposal); assert.ok(proposal.files[0].after.includes('return a + b;'));
    assert.ok(doc.getText().includes('return a - b;')); checks.push('composer proposes without mutating documents');
    await api.testing.review(proposal.id); checks.push('native diff opened');
    await api.testing.apply(proposal.id);
    assert.ok(doc.getText().includes('return a + b;')); assert.ok(doc.isDirty); checks.push('approved workspace edit applied with unsaved review');
    await doc.save();
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('undo');
    // Force a new exact source for the stale-proposal test, independent of editor undo grouping.
    const restore = new vscode.WorkspaceEdit(); restore.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), 'export function sum(a: number, b: number) {\n  return a - b;\n}\n');
    await vscode.workspace.applyEdit(restore);
    await api.testing.send('Corrige sum', 'edit');
    proposal = api.testing.proposals().at(-1); assert.ok(proposal);
    const userEdit = new vscode.WorkspaceEdit(); userEdit.insert(doc.uri, new vscode.Position(0, 0), '// User edit\n'); await vscode.workspace.applyEdit(userEdit);
    await assert.rejects(api.testing.apply(proposal.id), /cambió/); checks.push('stale proposal rejected without overwriting user edit');
    mode = 'inline';
    await config.update('inline.enabled', true, vscode.ConfigurationTarget.Global);
    const cancellation = new vscode.CancellationTokenSource();
    const items = await api.testing.complete(doc, new vscode.Position(2, 2), cancellation.token);
    assert.equal(items[0].insertText, 'return a + b;'); cancellation.dispose(); checks.push('inline completion produced from real provider adapter');
    await config.update('inline.enabled', false, vscode.ConfigurationTarget.Global);
    mode = 'slow';
    const pending = api.testing.send('Slow request', 'chat');
    await new Promise(resolve => setTimeout(resolve, 350)); api.testing.cancel(); await pending;
    assert.equal(api.testing.stats().busy, false); checks.push('in-flight cancellation released state');
    await fs.writeFile(process.env.CALED_TEST_RESULT, JSON.stringify({ passed: true, checks, vscode: vscode.version, requests: requests.length }, null, 2));
    console.log(`CALED_INTEGRATION_PASS ${checks.length} checks`);
    if (process.env.CALED_TEST_CAPTURE) await new Promise(resolve => setTimeout(resolve, 20000));
  } catch (error) {
    await fs.writeFile(process.env.CALED_TEST_RESULT, JSON.stringify({ passed: false, checks, error: error.stack }, null, 2));
    throw error;
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
};
