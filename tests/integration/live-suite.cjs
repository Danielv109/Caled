const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
exports.run = async function () {
  const checks = [];
  try {
    const config = vscode.workspace.getConfiguration('caled');
    await config.update('provider', 'ollama', vscode.ConfigurationTarget.Global);
    await config.update('model', process.env.CALED_LIVE_MODEL, vscode.ConfigurationTarget.Global);
    await config.update('inline.enabled', false, vscode.ConfigurationTarget.Global);
    const api = await vscode.extensions.getExtension('caled.caled').activate();
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'sum.ts')));
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('caled.open');
    await api.testing.send('Explica brevemente la función sum y su error. Responde en dos frases.', 'chat');
    assert.equal(api.testing.stats().history, 2); checks.push('real Ollama chat completed in editor');
    await api.testing.send('Corrige sum para sumar. La única ruta existente es sum.ts en la raíz; no existe carpeta src. Usa path exactamente "sum.ts", oldText exactamente "return a - b;" y newText exactamente "return a + b;". Devuelve la propuesta JSON.', 'edit');
    const proposal = api.testing.proposals().at(-1);
    assert.ok(proposal, 'The real model must return a valid proposal');
    assert.ok(proposal.files[0].after.includes('return a + b;')); checks.push('real model Composer proposal validated');
    await api.testing.review(proposal.id); await api.testing.apply(proposal.id);
    assert.ok(document.getText().includes('return a + b;')); checks.push('real model proposal reviewed and applied in editor');
    const result = { passed: true, model: process.env.CALED_LIVE_MODEL, checks, vscode: vscode.version, note: 'Small deterministic task; not a comprehensive model evaluation.' };
    await fs.writeFile(process.env.CALED_TEST_RESULT, JSON.stringify(result, null, 2));
    console.log('CALED_LIVE_DESKTOP_PASS');
  } catch (error) { await fs.writeFile(process.env.CALED_TEST_RESULT, JSON.stringify({ passed: false, checks, error: error.stack }, null, 2)); throw error; }
};
