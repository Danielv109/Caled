import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { renderHome, type HomeState } from '../src/ui/home';

type Event = { key?: string; data?: unknown; preventDefault: () => void };
class Element {
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, ((event: Event) => void)[]> = {};
  value = ''; textContent = ''; hidden = false; disabled = false; checked = false; tabIndex = 0; focused = false;
  constructor(readonly tag: string, attributes = '') {
    for (const match of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
      this.attributes[match[1]!] = match[2]!;
      if (match[1]!.startsWith('data-')) this.dataset[match[1]!.slice(5)] = match[2]!;
    }
    this.value = this.attributes.value ?? '';
    this.hidden = /\bhidden\b/.test(attributes);
  }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  addEventListener(name: string, listener: (event: Event) => void) { (this.listeners[name] ??= []).push(listener); }
  focus() { this.focused = true; }
  fire(name: string, extra: Partial<Event> = {}) { for (const fn of this.listeners[name] ?? []) fn({ preventDefault() {}, ...extra }); }
}
function studio(project: string | undefined = 'demo', state: HomeState = {}, cached?: unknown) {
  const html = renderHome('1234567890abcdefghijklmnop', 'en', project, state);
  const elements = [...html.matchAll(/<(button|input|textarea|select|form|section|h1|h2|p|span|div)\b([^>]*)>/g)].map(match => new Element(match[1]!, match[2]!));
  const byId = (id: string) => { const element = elements.find(item => item.attributes.id === id); if (!element) throw new Error(`Missing ${id}`); return element; };
  const query = (selector: string): Element[] => {
    const results = selector.split(',').flatMap(part => {
      let source = elements; let clause = part.trim();
      const form = /^(#brief-form|#personal-form) (.+)$/.exec(clause);
      if (form) {
        const ids = form[1] === '#brief-form' ? ['goal', 'audience', 'kind', 'criteria'] : ['display-name'];
        source = elements.filter(element => ids.includes(element.attributes.id ?? '') || form[1] === '#personal-form' && ['experience', 'accent'].includes(element.attributes.name ?? ''));
        clause = form[2]!;
      }
      const id = /^#([\w-]+)$/.exec(clause);
      if (id) return source.filter(element => element.attributes.id === id[1]);
      const name = /^[a-z]+/.exec(clause)?.[0];
      if (name) source = source.filter(element => element.tag === name);
      for (const attr of clause.matchAll(/\[([\w-]+)(?:="([^"]+)")?\]/g)) source = source.filter(element => attr[2] ? element.attributes[attr[1]!] === attr[2] : attr[1]! in element.attributes);
      if (clause.includes(':checked')) source = source.filter(element => element.checked);
      return source;
    });
    return [...new Set(results)];
  };
  const sent: Record<string, unknown>[] = [];
  let persisted = cached; let timerId = 0;
  const timers = new Map<number, () => void>(); const events = new Map<string, (event: Event) => void>();
  const body = new Element('body');
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error('Missing studio script');
  runInNewContext(script, {
    document: { body, getElementById: byId, querySelectorAll: query, querySelector: (selector: string) => query(selector)[0] },
    window: { addEventListener: (name: string, handler: (event: Event) => void) => events.set(name, handler) },
    acquireVsCodeApi: () => ({ getState: () => cached, setState: (value: unknown) => { persisted = JSON.parse(JSON.stringify(value)); }, postMessage: (value: Record<string, unknown>) => sent.push(JSON.parse(JSON.stringify(value))) }),
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
  });
  const sendReply = (type: string, requestId = sent.at(-1)?.requestId, message = 'Saved on this device.') => events.get('message')?.({ data: { type, requestId, message }, preventDefault() {} });
  return { html, byId, query, sent, sendReply, stored: () => persisted, expire: () => [...timers.values()].forEach(fn => fn()), body };
}

describe('Caled home', () => {
  const nonce = '1234567890abcdefghijklmnop';
  it('escapes untrusted project names without allowing executable content', () => {
    const html = renderHome(nonce, 'es', '<img src=x onerror="alert(1)">');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain("default-src 'none'");
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(() => renderHome('" unsafe', 'es')).toThrow();
  });
  it('provides both languages and a path to a new project without requiring an account', () => {
    const english = renderHome(nonce, 'en');
    expect(english).toContain('<html lang="en">');
    expect(english).toContain('Create my first project');
    expect(english).toContain('No account required.');
    expect(english.match(/<button[^>]+data-action="profile"/g)).toHaveLength(5);
    expect(renderHome(nonce, 'es')).toContain('Crear mi primer proyecto');
  });
  it('escapes host data in both markup and the inline script', () => {
    const attack = '</script><img src=x onerror="alert(1)">\u2028';
    const html = renderHome(nonce, 'en', attack, { displayName: attack, projectId: attack, modelLabel: attack, brief: { goal: attack, audience: attack, criteria: [attack], kind: 'web' } });
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain('<img');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toMatch(/<[^>]+\son\w+=/);
    expect(html).not.toContain('style="');
  });
  it('starts without posting any model or mutation request and supports keyboard tabs', () => {
    const app = studio();
    expect(app.sent).toHaveLength(0);
    app.byId('tab-home').fire('keydown', { key: 'ArrowRight' });
    expect(app.byId('section-project').hidden).toBe(false);
    expect(app.byId('tab-project').focused).toBe(true);
    expect(app.byId('tab-project').attributes['aria-selected']).toBe('true');
    app.byId('tab-project').fire('keydown', { key: 'End' });
    expect(app.byId('section-space').hidden).toBe(false);
  });
  it('only marks a notebook saved after its matching host acknowledgement', () => {
    const app = studio();
    app.byId('goal').value = 'Make a website'; app.byId('goal').fire('input');
    app.byId('brief-form').fire('submit');
    expect(app.sent[0]).toMatchObject({ action: 'saveBrief', brief: { goal: 'Make a website', criteria: [], kind: 'other' } });
    expect(app.byId('brief-state').textContent).toBe('Unsaved changes');
    app.sendReply('studioSaved', 'another-window');
    expect(app.byId('save-brief').disabled).toBe(true);
    app.sendReply('studioSaved');
    expect(app.byId('brief-state').textContent).toBe('Saved in this project');
    expect(app.byId('save-brief').disabled).toBe(false);
  });
  it('preserves typing after submission when the host acknowledges an earlier snapshot', () => {
    const app = studio();
    app.byId('goal').value = 'First idea'; app.byId('brief-form').fire('submit');
    app.byId('goal').value = 'A better idea'; app.byId('goal').fire('input');
    app.sendReply('studioSaved');
    expect(app.byId('goal').value).toBe('A better idea');
    expect(app.byId('brief-state').textContent).toBe('Unsaved changes');
    expect(app.byId('status').textContent).toContain('newer unsaved changes');
  });
  it('preserves drafts on a host failure or missing response, without claiming success', () => {
    const app = studio();
    app.byId('goal').value = 'Keep my draft'; app.byId('brief-form').fire('submit');
    app.sendReply('studioError', app.sent[0]?.requestId, 'Disk is full.');
    expect(app.byId('status').textContent).toBe('Disk is full.');
    expect(app.byId('goal').value).toBe('Keep my draft');
    app.byId('brief-form').fire('submit'); app.expire();
    expect(app.byId('status').textContent).toContain('No confirmation arrived');
    expect(app.byId('brief-state').textContent).toBe('Unsaved changes');
    expect(app.byId('save-brief').disabled).toBe(false);
  });
  it('requests only a prepared journey draft and rejects missing goals or excessive criteria', () => {
    const app = studio();
    app.query('[data-journey="plan"]')[0]!.fire('click');
    expect(app.sent).toHaveLength(0);
    app.byId('goal').value = 'Build a calendar';
    app.byId('criteria').value = Array.from({ length: 9 }, (_, index) => `Check ${index}`).join('\n');
    app.query('[data-journey="plan"]')[0]!.fire('click');
    expect(app.sent).toHaveLength(0);
    app.byId('criteria').value = 'Works offline\nKeyboard accessible';
    app.query('[data-journey="plan"]')[0]!.fire('click');
    expect(app.sent).toHaveLength(1);
    expect(app.sent[0]).toMatchObject({ action: 'journey', step: 'plan', brief: { criteria: ['Works offline', 'Keyboard accessible'] } });
    expect(app.html).toContain('clicking here does not run AI');
  });
  it('allows personalization without a folder while blocking notebook persistence', () => {
    const empty = studio('', { projectId: '' });
    empty.byId('goal').value = 'My idea'; empty.byId('brief-form').fire('submit');
    expect(empty.sent).toHaveLength(0);
    empty.byId('display-name').value = 'Ana'; empty.byId('personal-form').fire('submit');
    expect(empty.sent[0]).toMatchObject({ action: 'personalize', displayName: 'Ana', experience: 'guided', accent: 'sage' });
    empty.sendReply('studioSaved');
    expect(empty.byId('greeting').textContent).toBe('Let’s create, Ana.');
    expect(empty.html).toContain('My space');
  });
  it('requires confirmation before a starter replaces the existing draft', () => {
    const app = studio(); app.byId('goal').value = 'My own idea';
    app.query('[data-starter="0"]')[0]!.fire('click');
    expect(app.byId('goal').value).toBe('My own idea');
    expect(app.byId('replacement').hidden).toBe(false);
    app.byId('cancel-starter').fire('click');
    expect(app.byId('goal').value).toBe('My own idea');
    app.query('[data-starter="0"]')[0]!.fire('click'); app.byId('replace-starter').fire('click');
    expect(app.byId('goal').value).toContain('personal website');
    expect(app.sent).toHaveLength(0);
  });
  it('restores same-project drafts and isolates same-named folders by full identity', () => {
    const one = studio('demo', { projectId: 'D:/one/demo' });
    one.byId('goal').value = 'Unsent draft'; one.byId('goal').fire('input'); one.byId('tab-project').fire('click');
    const restored = studio('demo', { projectId: 'D:/one/demo' }, one.stored());
    expect(restored.byId('goal').value).toBe('Unsent draft');
    expect(restored.byId('section-project').hidden).toBe(false);
    const another = studio('demo', { projectId: 'D:/two/demo' }, one.stored());
    expect(another.byId('goal').value).toBe('');
    expect(another.byId('section-home').hidden).toBe(false);
  });
  it('preserves unfinished criteria verbatim when reloading instead of silently discarding lines', () => {
    const app = studio();
    const text = Array.from({ length: 9 }, (_, index) => `  Check ${index}`).join('\n');
    app.byId('criteria').value = text; app.byId('criteria').fire('input');
    const restored = studio('demo', {}, app.stored());
    expect(restored.byId('criteria').value).toBe(text);
    restored.byId('brief-form').fire('submit');
    expect(restored.sent).toHaveLength(0);
  });
  it('keeps an in-flight request correlated through a host-triggered rerender', () => {
    const app = studio();
    app.byId('goal').value = 'Submitted idea'; app.byId('brief-form').fire('submit');
    app.byId('goal').value = 'Newer idea'; app.byId('goal').fire('input');
    const restored = studio('demo', { brief: { goal: 'Submitted idea', audience: '', criteria: [], kind: 'other' } }, app.stored());
    expect(restored.byId('save-brief').disabled).toBe(true);
    restored.sendReply('studioSaved', app.sent[0]?.requestId);
    expect(restored.byId('save-brief').disabled).toBe(false);
    expect(restored.byId('goal').value).toBe('Newer idea');
    expect(restored.byId('brief-state').textContent).toBe('Unsaved changes');
  });
});
