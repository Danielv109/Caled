import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { renderWebview } from '../src/ui/webview';

type Listener = (event: Record<string, unknown>) => void;

/** Instrument the DOM boundary: using HTML to insert any model output fails the test. */
class Node {
  readonly children: Node[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly classList = { toggle: () => undefined, add: () => undefined, remove: () => undefined };
  className = '';
  title = '';
  value = '';
  disabled = false;
  hidden = false;
  open = false;
  focused = false;
  placeholder = '';
  scrollHeight = 100;
  scrollTop = 0;
  clientHeight = 100;
  private text = '';
  private parent?: Node;
  constructor(readonly tag: string) {}
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.children.length = 0; }
  set innerHTML(_value: string) { throw new Error('Unsafe HTML sink'); }
  get firstChild(): Node | null { return this.children[0] ?? null; }
  get childElementCount(): number { return this.children.length; }
  appendChild(node: Node): Node { node.parent = this; this.children.push(node); return node; }
  appendData(value: string): void { this.text += value; }
  replaceChildren(): void { this.children.length = 0; this.text = ''; }
  remove(): void { if (this.parent) { const index = this.parent.children.indexOf(this); if (index >= 0) this.parent.children.splice(index, 1); this.parent = undefined; } }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  toggleAttribute(name: string, force: boolean): void { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
  addEventListener(name: string, listener: Listener): void { this.listeners.set(name, [...this.listeners.get(name) ?? [], listener]); }
  emit(name: string, event: Record<string, unknown> = {}): void { this.listeners.get(name)?.forEach(listener => listener(event)); }
  click(): void { if (!this.disabled) this.emit('click'); }
  focus(): void { this.focused = true; }
}

function panel(saved?: unknown, language: 'es' | 'en' = 'es') {
  const ids = new Map<string, Node>();
  const created: Node[] = [];
  const outbound: Record<string, unknown>[] = [];
  const persisted: unknown[] = [];
  const window = new Node('window');
  const html = renderWebview('abcdefghijklmnop1234567890', language);
  const quick = Array.from(html.matchAll(/<button class="quick" data-prompt="([^"]*)" data-mode="([^"]*)"/g), match => {
    const button = new Node('button');
    button.dataset.prompt = match[1]!;
    button.dataset.mode = match[2]!;
    return button;
  });
  const document = {
    getElementById(id: string): Node {
      if (!ids.has(id)) ids.set(id, new Node(id));
      return ids.get(id)!;
    },
    createElement(tag: string): Node { const node = new Node(tag); created.push(node); return node; },
    createTextNode(text: string): Node { const node = new Node('#text'); node.textContent = text; return node; },
    querySelectorAll(selector: string): Node[] { return selector === '.quick' ? quick : []; },
  };
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Webview script missing');
  runInNewContext(script, {
    document, window, requestAnimationFrame: (callback: () => void) => callback(),
    setTimeout: (callback: () => void) => callback(),
    acquireVsCodeApi: () => ({
      getState: () => saved,
      setState: (state: unknown) => persisted.push(state),
      postMessage: (message: Record<string, unknown>) => outbound.push(message),
    }),
  });
  const host = (message: Record<string, unknown>) => window.emit('message', { data: message });
  const state = (changes: Record<string, unknown> = {}) => host({ type: 'state', provider: 'ollama', model: 'local-model', busy: false, indexedFiles: 20, trusted: true, ...changes });
  return { ids, created, outbound, persisted, host, state, get: document.getElementById, html, quick };
}

function buttons(node: Node): Node[] { return node.children.flatMap(child => [...(child.tag === 'button' ? [child] : []), ...buttons(child)]); }

function withClass(node: Node, className: string): Node[] {
  return node.children.flatMap(child => [...(child.className.split(' ').includes(className) ? [child] : []), ...withClass(child, className)]);
}

describe('webview trust boundaries and interaction', () => {
  it.each(['es', 'en'] as const)('offers accessible first steps and preferences in %s', language => {
    const view = panel(undefined, language);
    const markup = view.html.slice(0, view.html.indexOf('<script'));
    expect(markup).toContain('lang="' + language + '"');
    expect(markup).toContain('aria-label="' + (language === 'es' ? 'Preferencias' : 'Preferences') + '"');
    expect(markup).toContain(language === 'es' ? 'Describe' : 'Describe');
    expect(markup).toContain(language === 'es' ? 'Comprueba' : 'Check');
    expect(markup).toContain(language === 'es' ? 'sin cuenta' : 'no account needed');
    expect(markup).toContain('aria-describedby="agent-description"');
    expect(markup).toContain('prefers-reduced-motion');
    expect(markup).toContain('vscode-high-contrast-light');
    expect(markup).not.toMatch(/https?:\/\/|linear-gradient|sparkle/);
    view.state({ trusted: false, hasWorkspace: false });
    expect(view.get('project-entry').hidden).toBe(false);
    expect(view.get('open-folder').disabled).toBe(false);
    view.get('open-folder').click();
    expect(view.outbound.at(-1)).toEqual({ type: 'openFolder' });
    view.get('preferences').click();
    expect(view.outbound.at(-1)).toEqual({ type: 'preferences' });
    view.get('account').click();
    expect(view.outbound.at(-1)).toEqual({ type: 'account' });
    expect(view.get('prompt').disabled).toBe(true);
    view.state({ hasWorkspace: true });
    expect(view.get('project-entry').hidden).toBe(true);
    view.host({ type: 'start', mode: 'agent' });
    for (const id of ['preferences', 'account', 'select-agent', 'open-folder']) expect(view.get(id).disabled).toBe(true);
  });

  it('shows a bounded agent purpose as text and lets the host choose its profile', () => {
    const view = panel(undefined, 'en');
    const attack = '<img src=x onerror=alert(1)>';
    view.state({ agentLabel: 'Builder', agentDescription: attack + 'a'.repeat(1500) });
    view.get('mode-agent').click();
    expect(view.get('agent-profile').hidden).toBe(false);
    expect(view.get('agent-label').textContent).toBe('Builder');
    expect(view.get('agent-description').textContent).toHaveLength(1000);
    expect(view.get('agent-description').textContent).toContain(attack);
    expect(view.created.some(node => node.tag === 'img')).toBe(false);
    view.get('select-agent').click();
    expect(view.outbound.at(-1)).toEqual({ type: 'selectAgent' });
    view.get('mode-chat').click();
    expect(view.get('agent-profile').hidden).toBe(true);
  });

  it('localizes English statuses, prompts, approvals, checkpoints, and accessible announcements', () => {
    const view = panel(undefined, 'en');
    const markup = view.html.slice(0, view.html.indexOf('<script'));
    expect(markup).not.toMatch(/Conversación|Elegir modelo|Nueva conversación|Cargando|Historial/);
    view.state({ model: '', indexedFiles: 1 });
    expect(view.get('context-label').textContent).toBe('1 file in context');
    expect(view.get('model-name').textContent).toBe('Choose model');
    view.quick.find(button => button.dataset.mode === 'agent')!.click();
    expect(view.get('prompt').value).toBe('Investigate and solve this task: ');
    expect(view.get('prompt').placeholder).toBe('Describe the task you want to solve…');
    view.get('send').click();
    expect(view.get('send').attributes.get('aria-label')).toBe('Cancel response');
    expect(view.get('announcer').textContent).toBe('Request sent. Caled is working.');
    view.host({ type: 'start', mode: 'agent' });
    view.host({ type: 'agentStep', step: 1, action: 'read', status: 'done', detail: 'texto del archivo' });
    expect(view.get('conversation').textContent).toContain('1. Read fileCompleted');
    expect(view.get('conversation').textContent).toContain('texto del archivo');
    view.host({ type: 'proposal', id: 'en-edit', summary: 'Resumen conservado', files: ['hola.ts'], awaitingApproval: true });
    expect(view.get('conversation').textContent).toContain('Changes ready for review');
    expect(view.get('conversation').textContent).toContain('Resumen conservado');
    const apply = view.created.find(node => node.tag === 'button' && node.textContent === 'Apply changes')!;
    apply.click();
    expect(apply.textContent).toBe('Applying…');
    view.host({ type: 'applied', id: 'en-edit' });
    view.host({ type: 'approval', id: 'en-command', command: 'npm test', cwd: 'D:\\project' });
    expect(view.get('conversation').textContent).toContain('The agent wants to run a command');
    const allow = view.created.find(node => node.tag === 'button' && node.textContent === 'Approve once')!;
    allow.click();
    expect(view.outbound.at(-1)).toEqual({ type: 'approve', id: 'en-command', allow: true });
    view.host({ type: 'agentResult', text: 'La respuesta del modelo permanece en su idioma.' });
    view.host({ type: 'done' });
    expect(view.get('conversation').textContent).toContain('La respuesta del modelo permanece en su idioma.');
    expect(view.get('announcer').textContent).toBe('Response complete.');
    view.host({ type: 'checkpoints', items: [{ id: 'saved', summary: 'Resumen', createdAt: 'invalid', files: ['hola.ts'] }] });
    expect(view.get('checkpoint-list').textContent).toContain('Date unavailable');
    expect(view.get('checkpoint-list').textContent).toContain('1 file');
    const restore = buttons(view.get('checkpoint-list'))[0]!;
    expect(restore.attributes.get('aria-label')).toBe('Restore files: Resumen');
    restore.click();
    view.host({ type: 'restored', id: 'saved' });
    expect(restore.textContent).toBe('Files restored');
    expect(view.get('conversation').textContent).toContain('Files restored from change history.');
  });

  it('preserves user and model messages across a language change without restoring authority', () => {
    const spanish = panel();
    spanish.state();
    spanish.host({ type: 'user', text: 'Mi idea' });
    spanish.host({ type: 'start', mode: 'chat' });
    spanish.host({ type: 'delta', text: 'Explicación en español' });
    spanish.host({ type: 'done' });
    const englishView = panel(spanish.persisted.at(-1), 'en');
    englishView.state();
    expect(englishView.get('conversation').textContent).toContain('YouMi idea');
    expect(englishView.get('conversation').textContent).toContain('Explicación en español');
    expect(buttons(englishView.get('conversation'))).toHaveLength(0);
    expect(englishView.get('send').attributes.get('aria-label')).toBe('Send message');
  });

  it('rejects CSP nonce injection and grants no remote or inline-script access', () => {
    expect(() => renderWebview('x\" onload=\"alert(1)')).toThrow();
    expect(() => renderWebview("'; script-src *; ")).toThrow();
    const { html } = panel();
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abcdefghijklmnop1234567890'");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toContain("'unsafe-eval'");
  });

  it('sends once, blocks conflicting actions, cancels once, and respects workspace trust', () => {
    const view = panel();
    expect(view.outbound).toEqual([{ type: 'ready' }]);
    expect(view.get('prompt').disabled).toBe(true);
    view.state();
    view.get('prompt').value = 'Revisa mi proyecto';
    view.get('prompt').emit('input');
    view.get('send').click();
    expect(view.outbound.at(-1)).toEqual({ type: 'send', text: 'Revisa mi proyecto', mode: 'chat' });
    expect(view.get('model').disabled).toBe(true);
    expect(view.get('send-icon').attributes.has('hidden')).toBe(true);
    expect(view.get('cancel-icon').attributes.has('hidden')).toBe(false);
    view.get('prompt').value = 'No debe enviarse durante la respuesta';
    view.get('prompt').emit('keydown', { key: 'Enter', shiftKey: false, isComposing: false, preventDefault: () => undefined });
    expect(view.outbound.filter(item => item.type === 'send')).toHaveLength(1);
    view.get('send').click();
    view.get('send').click();
    expect(view.outbound.filter(item => item.type === 'cancel')).toHaveLength(1);
    view.host({ type: 'done' });
    view.state({ trusted: false });
    expect(view.get('prompt').disabled).toBe(true);
    expect(view.get('send').disabled).toBe(true);
    expect(view.get('trust-notice').hidden).toBe(false);
  });

  it('keeps hostile model content as text through streaming, code formatting, and persistence', () => {
    const view = panel();
    view.state();
    view.host({ type: 'start', mode: 'chat' });
    const attack = '<img src=x onerror="alert(1)"><script>document.body.remove()</script>';
    view.host({ type: 'delta', text: attack });
    view.host({ type: 'delta', text: '\n```html\n' + attack + '\n```' });
    view.host({ type: 'done' });
    expect(view.created.some(node => node.tag === 'img' || node.tag === 'script')).toBe(false);
    expect(view.created.find(node => node.tag === 'code')?.textContent).toBe(attack);
    expect(view.get('conversation').textContent).toContain(attack);
    const saved = view.persisted.at(-1) as { version: number; messages: { role: string; text: string }[] };
    expect(Object.keys(saved).sort()).toEqual(['messages', 'version']);
    expect(saved.messages[0]?.text).toContain(attack);
    expect(saved.messages[0]?.role).toBe('assistant');
  });

  it('prevents repeat application, recovers from an error, and clears conversation state', () => {
    const view = panel();
    view.state();
    view.host({ type: 'proposal', id: 'change-1', summary: 'Validar entradas', files: ['src/main.ts'] });
    const apply = view.created.find(node => node.tag === 'button' && node.textContent === 'Aplicar cambios')!;
    apply.click();
    apply.click();
    expect(view.outbound.filter(item => item.type === 'apply')).toHaveLength(1);
    view.host({ type: 'error', message: 'El archivo ha cambiado.' });
    expect(apply.disabled).toBe(false);
    apply.click();
    expect(view.outbound.filter(item => item.type === 'apply')).toHaveLength(2);
    view.host({ type: 'applied', id: 'change-1' });
    expect(apply.disabled).toBe(true);
    expect(view.get('conversation').textContent).toContain('Cambios aplicados');
    view.host({ type: 'cleared' });
    expect(view.get('conversation').childElementCount).toBe(0);
    expect(view.get('welcome').hidden).toBe(false);
    expect(view.persisted.at(-1)).toEqual({ version: 1, messages: [] });
  });

  it('restores bounded conversation data and ignores invalid roles', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ role: 'assistant', text: 'Respuesta ' + i }));
    messages.push({ role: 'system', text: 'Contenido no admitido' });
    const view = panel({ version: 1, messages });
    expect(view.get('conversation').childElementCount).toBe(39);
    expect(view.get('conversation').textContent).not.toContain('Contenido no admitido');
    view.state();
    view.host({ type: 'start', mode: 'chat' });
    view.host({ type: 'delta', text: 'a'.repeat(179950) });
    view.host({ type: 'done' });
    const saved = view.persisted.at(-1) as { messages: { text: string }[] };
    expect(saved.messages.length).toBeLessThanOrEqual(40);
    expect(saved.messages.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(180000);
  });

  it('supports three modes, keyboard navigation, quick actions, and IME composition', () => {
    const view = panel();
    view.state();
    const key = (name: string) => ({ key: name, preventDefault: () => undefined });
    view.get('mode-chat').emit('keydown', key('ArrowRight'));
    expect(view.get('mode-edit').attributes.get('aria-pressed')).toBe('true');
    expect(view.get('mode-edit').focused).toBe(true);
    view.get('mode-edit').emit('keydown', key('End'));
    expect(view.get('mode-agent').attributes.get('aria-pressed')).toBe('true');
    expect(view.get('prompt').placeholder).toContain('tarea');
    view.get('mode-agent').emit('keydown', key('ArrowRight'));
    expect(view.get('mode-chat').attributes.get('aria-pressed')).toBe('true');
    view.quick.find(button => button.dataset.mode === 'agent')!.click();
    expect(view.get('prompt').focused).toBe(true);
    view.get('prompt').value = 'Resuelve la tarea';
    view.get('prompt').emit('keydown', { ...key('Enter'), isComposing: true });
    view.get('prompt').emit('keydown', { ...key('Enter'), shiftKey: true });
    expect(view.outbound.filter(item => item.type === 'send')).toHaveLength(0);
    view.get('prompt').emit('keydown', key('Enter'));
    expect(view.outbound.at(-1)).toEqual({ type: 'send', mode: 'agent', text: 'Resuelve la tarea' });
    view.get('mode-agent').emit('keydown', key('Home'));
    expect(view.get('mode-agent').attributes.get('aria-pressed')).toBe('true');
    expect(view.quick.every(button => button.disabled)).toBe(true);
  });

  it('uses the same 16000 character limit for HTML and scripted submissions', () => {
    const view = panel();
    view.state();
    expect(view.html).toContain('maxlength="16000"');
    view.get('prompt').value = 'a'.repeat(16001);
    view.get('prompt').emit('input');
    view.get('send').click();
    expect(view.outbound.filter(item => item.type === 'send')).toHaveLength(0);
    expect(view.get('conversation').textContent).toContain('16.000 caracteres');
    view.get('prompt').value = 'a'.repeat(16000);
    view.get('send').click();
    expect(view.outbound.filter(item => item.type === 'send')).toHaveLength(1);
  });

  it('shows exact hostile commands and folders and authorizes each command only once while busy', () => {
    const view = panel();
    view.state();
    view.host({ type: 'start', mode: 'agent' });
    const command = 'node -e "console.log(\'<img src=x onerror=alert(1)>\')"\nWrite-Output next';
    const cwd = 'D:\\Caled\\<script>example</script>';
    const request = { type: 'approval', id: 'command-1', command, cwd };
    view.host(request);
    view.host(request);
    expect(withClass(view.get('conversation'), 'approval')).toHaveLength(1);
    const card = withClass(view.get('conversation'), 'approval')[0]!;
    expect(card.textContent).toContain(command);
    expect(card.textContent).toContain(cwd);
    expect(view.created.some(node => node.tag === 'img' || node.tag === 'script')).toBe(false);
    const [allow, reject] = buttons(card);
    expect(allow!.disabled).toBe(false);
    expect(view.get('configure').disabled).toBe(true);
    allow!.click();
    allow!.click();
    reject!.click();
    expect(view.outbound.filter(item => item.type === 'approve')).toEqual([{ type: 'approve', id: 'command-1', allow: true }]);
    expect(view.get('mode-chat').disabled).toBe(true);
    view.host({ type: 'approval', id: 'command-2', command: 'npm test', cwd: 'D:\\Caled' });
    buttons(withClass(view.get('conversation'), 'approval')[1]!)[1]!.click();
    expect(view.outbound.at(-1)).toEqual({ type: 'approve', id: 'command-2', allow: false });
  });

  it('expires terminal and agent edit approvals immediately on cancel, trust loss, done, and reload', () => {
    const view = panel();
    view.state();
    view.host({ type: 'start', mode: 'agent' });
    view.host({ type: 'approval', id: 'cmd', command: 'npm test', cwd: 'D:\\Caled' });
    view.host({ type: 'proposal', id: 'edit', summary: 'Cambio', files: ['a.ts'], awaitingApproval: true });
    const allow = buttons(withClass(view.get('conversation'), 'approval')[0]!)[0]!;
    const apply = buttons(view.get('conversation')).find(button => button.textContent === 'Aplicar cambios')!;
    view.get('send').click();
    expect(allow.disabled).toBe(true);
    expect(apply.disabled).toBe(true);
    allow.emit('click');
    apply.emit('click');
    expect(view.outbound.filter(item => item.type === 'approve' || item.type === 'apply')).toHaveLength(0);
    view.host({ type: 'done' });
    const saved = view.persisted.at(-1);
    expect(JSON.stringify(saved)).not.toContain('npm test');
    const reloaded = panel(saved);
    reloaded.state({ busy: true });
    expect(buttons(reloaded.get('conversation'))).toHaveLength(0);
    view.host({ type: 'start', mode: 'agent' });
    view.host({ type: 'approval', id: 'cmd2', command: 'npm test', cwd: 'D:\\Caled' });
    const allow2 = buttons(withClass(view.get('conversation'), 'approval')[1]!)[0]!;
    view.state({ trusted: false, busy: true });
    expect(allow2.disabled).toBe(true);
    view.state({ trusted: true, busy: true });
    expect(allow2.disabled).toBe(true);
    view.host({ type: 'approval', id: 'cmd3', command: 'npm test', cwd: 'D:\\Caled' });
    const allow3 = buttons(withClass(view.get('conversation'), 'approval')[2]!)[0]!;
    view.host({ type: 'done' });
    expect(allow3.disabled).toBe(true);
    view.host({ type: 'approval', id: 'late', command: 'npm test', cwd: 'D:\\Caled' });
    expect(withClass(view.get('conversation'), 'approval')).toHaveLength(3);
  });

  it('permits only the awaited agent proposal while busy and keeps working after apply', () => {
    const view = panel();
    view.state();
    view.host({ type: 'proposal', id: 'old', summary: 'Anterior', files: ['a.ts'] });
    view.host({ type: 'start', mode: 'agent' });
    view.host({ type: 'proposal', id: 'next', summary: 'Siguiente', files: ['b.ts'], awaitingApproval: true });
    const cards = withClass(view.get('conversation'), 'proposal');
    const old = buttons(cards[0]!);
    const next = buttons(cards[1]!);
    expect(old.every(button => button.disabled)).toBe(true);
    expect(next.every(button => !button.disabled)).toBe(true);
    next[0]!.click();
    expect(view.outbound.at(-1)).toEqual({ type: 'review', id: 'next' });
    next[1]!.click();
    next[1]!.click();
    expect(view.outbound.filter(item => item.type === 'apply')).toHaveLength(1);
    view.host({ type: 'error', message: 'El archivo cambió', recoverable: true });
    expect(view.get('mode-chat').disabled).toBe(true);
    expect(next[1]!.disabled).toBe(false);
    next[1]!.click();
    expect(view.outbound.filter(item => item.type === 'apply')).toHaveLength(2);
    view.host({ type: 'applied', id: 'next' });
    expect(view.get('mode-chat').disabled).toBe(true);
    expect(next.every(button => button.disabled)).toBe(true);
    view.host({ type: 'proposal', id: 'another', summary: 'Otro', files: ['c.ts'], awaitingApproval: true });
    const another = buttons(withClass(view.get('conversation'), 'proposal')[2]!);
    view.host({ type: 'proposalExpired', id: 'another' });
    expect(another.every(button => button.disabled)).toBe(true);
    view.host({ type: 'done' });
    expect(view.get('mode-chat').disabled).toBe(false);
  });

  it('updates bounded agent steps safely and renders the final result without ending the host task', () => {
    const view = panel();
    view.state();
    view.host({ type: 'start', mode: 'agent' });
    const attack = '<img src=x onerror=alert(1)>';
    view.host({ type: 'agentStep', step: 1, action: attack, status: 'running' });
    view.host({ type: 'agentStep', step: 1, action: attack, status: 'done', detail: attack });
    const steps = withClass(view.get('conversation'), 'step');
    expect(steps).toHaveLength(1);
    expect(steps[0]!.attributes.get('data-status')).toBe('done');
    expect(steps[0]!.textContent).toContain(attack);
    view.host({ type: 'agentStep', step: -1, action: 'Invalid', status: 'done' });
    view.host({ type: 'agentStep', step: 2, action: 'Invalid', status: 'unknown' });
    expect(withClass(view.get('conversation'), 'step')).toHaveLength(1);
    for (let step = 2; step <= 60; step++) view.host({ type: 'agentStep', step, action: 'Leer archivo', status: 'done', detail: 'x'.repeat(10000) });
    expect(withClass(view.get('conversation'), 'step')).toHaveLength(24);
    expect(view.get('conversation').textContent.length).toBeLessThan(210000);
    view.host({ type: 'agentResult', text: 'Resultado\n```html\n' + attack + '\n```' });
    expect(view.get('conversation').textContent).toContain('Resultado');
    expect(view.created.some(node => node.tag === 'img')).toBe(false);
    expect(view.get('mode-chat').disabled).toBe(true);
    view.host({ type: 'done' });
    expect(view.get('mode-chat').disabled).toBe(false);
    const saved = view.persisted.at(-1) as { messages: { text: string }[] };
    expect(saved.messages).toHaveLength(1);
    expect(saved.messages[0]!.text).toContain('Resultado');
  });

  it('opens checkpoint history and restores once with error recovery and safe text', () => {
    const view = panel();
    view.state();
    view.get('checkpoints').click();
    expect(view.outbound.at(-1)).toEqual({ type: 'listCheckpoints' });
    expect(view.get('checkpoint-panel').open).toBe(true);
    expect(view.get('checkpoints').attributes.get('aria-expanded')).toBe('true');
    const attack = '<script>alert(1)</script>';
    view.host({ type: 'checkpoints', items: [{ id: 'checkpoint', summary: attack, createdAt: '2026-09-22T12:00:00Z', files: [attack] }] });
    expect(view.get('checkpoint-list').textContent).toContain(attack);
    expect(view.created.some(node => node.tag === 'script')).toBe(false);
    const restore = buttons(view.get('checkpoint-list'))[0]!;
    restore.click();
    restore.click();
    expect(view.outbound.filter(item => item.type === 'restoreCheckpoint')).toHaveLength(1);
    expect(view.get('send').disabled).toBe(true);
    view.host({ type: 'error', message: 'Archivo modificado' });
    expect(restore.disabled).toBe(false);
    restore.click();
    view.host({ type: 'restored', id: 'checkpoint' });
    expect(restore.disabled).toBe(true);
    expect(restore.textContent).toBe('Archivos restaurados');
    expect(view.get('conversation').textContent).toContain('Archivos restaurados');
    view.host({ type: 'checkpoints', items: [] });
    expect(view.get('checkpoint-list').textContent).toContain('Los cambios aplicados');
    restore.emit('click');
    expect(view.outbound.filter(item => item.type === 'restoreCheckpoint')).toHaveLength(2);
  });

  it('bounds conversation nodes, message text, checkpoint cards, and obsolete proposal closures', () => {
    const view = panel();
    view.state();
    view.host({ type: 'proposal', id: 'old', summary: 'Old', files: ['a.ts'] });
    const oldApply = buttons(view.get('conversation'))[1]!;
    for (let i = 0; i < 150; i++) {
      view.host({ type: 'user', text: 'Mensaje ' + i });
      view.host({ type: 'proposal', id: 'p' + i, summary: 'Propuesta ' + i, files: ['b.ts'] });
      view.host({ type: 'notice', message: 'Aviso ' + i });
    }
    expect(view.get('conversation').childElementCount).toBeLessThanOrEqual(64);
    expect(oldApply.disabled).toBe(true);
    oldApply.emit('click');
    expect(view.outbound.filter(item => item.type === 'apply')).toHaveLength(0);
    view.host({ type: 'start', mode: 'chat' });
    view.host({ type: 'delta', text: 'z'.repeat(500000) });
    view.host({ type: 'done' });
    expect(view.get('conversation').textContent.length).toBeLessThan(281000);
    view.host({ type: 'checkpoints', items: Array.from({ length: 150 }, (_, index) => ({ id: String(index), summary: 'Cambios', createdAt: 1000, files: [] })) });
    expect(buttons(view.get('checkpoint-list'))).toHaveLength(30);
    view.host({ type: 'cleared' });
    expect(view.get('conversation').childElementCount).toBe(0);
  });
});
