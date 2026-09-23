import { describe, expect, it, vi } from 'vitest';
import { parseAction, runAgent, type AgentEnvironment } from '../src/agent/engine';

function environment(): AgentEnvironment {
  return { list: vi.fn(async () => 'a.ts'), read: vi.fn(async () => 'const a = 1;'), search: vi.fn(async () => 'a.ts'), diagnostics: vi.fn(async () => '[]'), edit: vi.fn(async () => ({ applied: true, detail: 'applied' })), terminal: vi.fn(async () => ({ approved: true, detail: 'exitCode 0' })), onStep: vi.fn() };
}
describe('agent loop', () => {
  it('observes tool results and completes a bounded read/edit/test workflow', async () => {
    const env = environment(); const responses = [
      { action: 'read', path: 'a.ts', startLine: 1, endLine: 20 },
      { action: 'edit', proposal: { summary: 'change', edits: [{ path: 'a.ts', oldText: '1', newText: '2' }] } },
      { action: 'terminal', command: 'npm test' },
      { action: 'finish', summary: 'Tests completed' }
    ];
    const complete = vi.fn(async () => JSON.stringify(responses.shift()));
    const result = await runAgent('Fix a', '', env, complete, new AbortController().signal);
    expect(result).toMatchObject({ reason: 'finished', steps: 4, editsApplied: 1, commandsRun: 1 });
    expect(env.read).toHaveBeenCalledWith('a.ts', 1, 20);
    expect(env.terminal).toHaveBeenCalledOnce();
    expect(env.onStep).toHaveBeenCalledWith(expect.objectContaining({ action: 'edit', status: 'done' }));
  });
  it('stops after a rejected command without another model call', async () => {
    const env = environment(); env.terminal = vi.fn(async () => ({ approved: false, detail: 'denied' }));
    const complete = vi.fn(async () => '{"action":"terminal","command":"npm test"}');
    expect(await runAgent('Task', '', env, complete, new AbortController().signal)).toMatchObject({ reason: 'denied', commandsRun: 0 });
    expect(complete).toHaveBeenCalledOnce();
  });
  it('stops after rejected edits and never requests terminal', async () => {
    const env = environment(); env.edit = vi.fn(async () => ({ applied: false, detail: 'denied' }));
    const response = JSON.stringify({ action: 'edit', proposal: { summary: 'x', edits: [{ path: 'a.ts', oldText: 'a', newText: 'b' }] } });
    expect(await runAgent('Task', '', env, async () => response, new AbortController().signal)).toMatchObject({ reason: 'denied', editsApplied: 0 });
    expect(env.terminal).not.toHaveBeenCalled();
  });
  it('cancels before tool execution when a model finishes after cancellation', async () => {
    const env = environment(), abort = new AbortController();
    const complete = async () => { abort.abort(); return '{"action":"list"}'; };
    await expect(runAgent('Task', '', env, complete, abort.signal)).rejects.toThrow();
    expect(env.list).not.toHaveBeenCalled();
  });
  it('makes only one correction for malformed actions and enforces the step budget', async () => {
    const env = environment(); const invalid = vi.fn(async () => 'invalid');
    await expect(runAgent('Task', '', env, invalid, new AbortController().signal)).rejects.toThrow(/válidas/);
    expect(invalid).toHaveBeenCalledTimes(2);
    expect(await runAgent('Task', '', env, async () => '{"action":"list"}', new AbortController().signal, 2)).toMatchObject({ reason: 'limit', steps: 2 });
  });
  it('does not retry a provider/network failure as invalid JSON', async () => {
    const complete = vi.fn(async () => { throw new Error('offline'); });
    await expect(runAgent('Task', '', environment(), complete, new AbortController().signal)).rejects.toThrow('offline');
    expect(complete).toHaveBeenCalledOnce();
  });
  it('feeds a tool failure back as failure rather than a successful result', async () => {
    const env = environment(); env.read = vi.fn(async () => { throw new Error('denied path'); });
    let n = 0;
    await runAgent('Task', '', env, async messages => {
      if (n++ === 0) return '{"action":"read","path":"x","startLine":1,"endLine":10}';
      expect(messages.at(-1)?.content).toContain('Tool failed: denied path');
      return '{"action":"finish","summary":"Unable to read"}';
    }, new AbortController().signal);
  });
  it.each(['{}', '[]', '{"action":"shell"}', '{"action":"read","path":"a","startLine":0}', '{"action":"read","path":"a","endLine":9999}', '{"action":"terminal","command":""}'])('rejects malformed action %s', input => expect(() => parseAction(input)).toThrow());
});
