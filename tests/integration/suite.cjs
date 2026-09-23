const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
  const requests = [];
  let mode = 'chat';
  let agentActions = [];
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    if (req.url === '/api/tags') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ models: [{ name: 'caled-test-model' }] })); return; }
    if (req.url !== '/api/chat') { res.writeHead(404); res.end(); return; }
    const body = JSON.parse(Buffer.concat(parts).toString()); requests.push(body);
    res.setHeader('Content-Type', 'application/x-ndjson');
    if (mode === 'slow') { res.write(JSON.stringify({ message: { content: 'Partial' }, done: false }) + '\n'); req.on('close', () => res.end()); return; }
    const content = mode === 'agent' ? agentActions.shift() : mode === 'edit' ? JSON.stringify({ summary: 'Corrige suma', edits: [{ path: 'sum.ts', oldText: 'return a - b;', newText: 'return a + b;' }] }) : mode === 'inline' ? 'return a + b;' : 'La función sum está en sum.ts. Recibe dos números.';
    if (typeof content !== 'string') { res.writeHead(500); res.end('No agent action queued'); return; }
    for (const text of [content.slice(0, 8), content.slice(8)]) res.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
    res.end(JSON.stringify({ message: { content: '' }, done: true }) + '\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const checks = [];
  const waitFor = async (read, label, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
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
    for (const cmd of ['caled.open', 'caled.configure', 'caled.edit', 'caled.agent', 'caled.checkpoints', 'caled.reindex', 'caled.account', 'caled.selectAgent', 'caled.preferences', 'caled.openFolder']) assert.ok(commands.includes(cmd), cmd);
    checks.push('commands registered');
    for (const appearance of ['light', 'dark', 'system']) {
      await config.update('appearance', appearance, vscode.ConfigurationTarget.Global);
      await api.testing.appearance();
      assert.equal(vscode.workspace.getConfiguration('window').get('autoDetectColorScheme'), appearance === 'system');
      if (appearance !== 'system') assert.equal(vscode.workspace.getConfiguration('workbench').get('colorTheme'), appearance === 'light' ? 'Caled Light' : 'Caled Dark');
    }
    assert.ok(extension.packageJSON.contributes.themes.some(theme => theme.label === 'Caled Light'));
    assert.ok(extension.packageJSON.contributes.themes.some(theme => theme.label === 'Caled Dark'));
    checks.push('native light, dark and system appearance settings applied');
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
    // Restore a clean, saved source before exercising the autonomous loop.
    const agentBaseline = new vscode.WorkspaceEdit();
    agentBaseline.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), 'export function sum(a: number, b: number) {\n  return a - b;\n}\n');
    await vscode.workspace.applyEdit(agentBaseline); await doc.save();
    const marker = path.join(root, 'agent-check.txt');
    await fs.rm(marker, { force: true });
    mode = 'agent';
    agentActions = [
      JSON.stringify({ action: 'read', path: 'sum.ts', startLine: 1, endLine: 3 }),
      JSON.stringify({ action: 'edit', proposal: { summary: 'Agente corrige suma', edits: [{ path: 'sum.ts', oldText: 'return a - b;', newText: 'return a + b;' }] } }),
      JSON.stringify({ action: 'terminal', command: `node -e "require('fs').writeFileSync('agent-check.txt','ok')"` }),
      JSON.stringify({ action: 'finish', summary: 'Suma corregida y comprobación ejecutada.' })
    ];
    const agentRun = api.testing.send('Corrige la suma y ejecuta la comprobación', 'agent');
    const editPermission = await waitFor(() => api.testing.permission()?.kind === 'edit' ? api.testing.permission() : undefined, 'agent edit permission');
    assert.ok((await fs.readFile(path.join(root, 'sum.ts'), 'utf8')).includes('return a - b;'));
    const agentProposal = api.testing.proposals().find(item => item.id === editPermission.id);
    assert.ok(agentProposal?.awaitingApproval); await api.testing.apply(agentProposal.id);
    const terminalPermission = await waitFor(() => api.testing.permission()?.kind === 'terminal' ? api.testing.permission() : undefined, 'terminal permission');
    await assert.rejects(fs.access(marker));
    api.testing.approve(terminalPermission.id, true);
    await agentRun;
    assert.equal(await fs.readFile(marker, 'utf8'), 'ok');
    assert.ok((await fs.readFile(path.join(root, 'sum.ts'), 'utf8')).includes('return a + b;'));
    const agentResult = api.testing.agentResult();
    assert.equal(agentResult.reason, 'finished'); assert.equal(agentResult.editsApplied, 1); assert.equal(agentResult.commandsRun, 1);
    checks.push('agent read, reviewed edit, saved, approved command, and finished from observed results');
    const checkpoint = (await api.testing.checkpoints()).find(item => item.summary === 'Agente corrige suma');
    assert.ok(checkpoint); await api.testing.restore(checkpoint.id);
    assert.ok(doc.getText().includes('return a - b;')); assert.ok(doc.isDirty); await doc.save();
    checks.push('agent checkpoint restored the original file');
    await config.update('agent.profile', 'reviewer', vscode.ConfigurationTarget.Global);
    await config.update('language', 'en', vscode.ConfigurationTarget.Global);
    agentActions = [
      JSON.stringify({ action: 'edit', proposal: { summary: 'Must be blocked', edits: [{ path: 'sum.ts', oldText: 'return a - b;', newText: 'return a + b;' }] } }),
      JSON.stringify({ action: 'terminal', command: 'echo MustNotRun' }),
      JSON.stringify({ action: 'finish', summary: 'Review complete. No files changed.' })
    ];
    await api.testing.send('Review only', 'agent');
    assert.deepEqual([api.testing.agentResult().editsApplied, api.testing.agentResult().commandsRun], [0, 0]);
    assert.equal(api.testing.permission(), undefined);
    assert.ok(doc.getText().includes('return a - b;'));
    assert.ok(requests.at(-1).messages[0].content.includes('English'));
    assert.ok(api.testing.events().some(event => event.type === 'state' && event.agentLabel === 'Reviewer'));
    checks.push('read-only agent blocks model-requested edits and commands; English profile works');
    await config.update('agent.profile', 'builder', vscode.ConfigurationTarget.Global);
    agentActions = [JSON.stringify({ action: 'terminal', command: 'echo CancelOnReload' })];
    const waiting = api.testing.send('Check reload cancellation', 'agent');
    await waitFor(() => api.testing.permission()?.kind === 'terminal', 'approval before reload');
    await api.testing.message({ type: 'ready' }); await waiting;
    assert.equal(api.testing.agentResult().reason, 'denied');
    assert.equal(api.testing.permission(), undefined);
    checks.push('reloading the panel rejects invisible terminal approvals');
    await config.update('language', 'es', vscode.ConfigurationTarget.Global);
    mode = 'slow';
    const pending = api.testing.send('Slow request', 'chat');
    await new Promise(resolve => setTimeout(resolve, 350)); api.testing.cancel(); await pending;
    assert.equal(api.testing.stats().busy, false); checks.push('in-flight cancellation released state');
    if (process.env.CALED_TEST_CAPTURE) {
      await config.update('language', process.env.CALED_TEST_LANGUAGE || 'es', vscode.ConfigurationTarget.Global);
      await config.update('appearance', process.env.CALED_TEST_APPEARANCE || 'dark', vscode.ConfigurationTarget.Global);
      await api.testing.appearance();
      await api.testing.message({ type: 'clear' });
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await vscode.commands.executeCommand('caled.home');
      await vscode.commands.executeCommand('caled.open');
      await vscode.commands.executeCommand('notifications.hideToasts');
    }
    await fs.writeFile(process.env.CALED_TEST_RESULT, JSON.stringify({ passed: true, checks, vscode: vscode.version, requests: requests.length }, null, 2));
    console.log(`CALED_INTEGRATION_PASS ${checks.length} checks`);
    if (process.env.CALED_TEST_CAPTURE) await new Promise(resolve => setTimeout(resolve, 20000));
  } catch (error) {
    await fs.writeFile(process.env.CALED_TEST_RESULT, JSON.stringify({ passed: false, checks, error: error.stack }, null, 2));
    throw error;
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
};
