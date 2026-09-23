import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { parseProposal, prepareProposal } from '../src/core/edits';
import { safeWorkspacePath, validateRelativePath } from '../src/index/policy';

const boundary = path.resolve('artifacts/test-edits');
let root: string;
beforeEach(async () => { await mkdir(boundary, { recursive: true }); root = await mkdtemp(path.join(boundary, 'case-')); });
afterEach(async () => { if (path.resolve(root).startsWith(boundary + path.sep)) await rm(root, { recursive: true, force: true }); });
const proposal = (file: string, oldText: string, newText: string) => parseProposal(JSON.stringify({ summary: 'Change', edits: [{ path: file, oldText, newText }] }));
describe('reviewable edits', () => {
  it('prepares a replacement without writing to disk', async () => {
    await writeFile(path.join(root, 'a.ts'), 'const x = 1;\n');
    const files = await prepareProposal(root, proposal('a.ts', 'x = 1', 'x = 2'));
    expect(files[0]).toMatchObject({ before: 'const x = 1;\n', after: 'const x = 2;\n', exists: true });
    expect(await readFile(path.join(root, 'a.ts'), 'utf8')).toBe('const x = 1;\n');
  });
  it('honors unsaved content supplied by the editor', async () => {
    await writeFile(path.join(root, 'a.ts'), 'disk');
    const files = await prepareProposal(root, proposal('a.ts', 'buffer', 'edited'), async () => 'buffer');
    expect(files[0].before).toBe('buffer'); expect(files[0].after).toBe('edited');
  });
  it('rejects stale and ambiguous replacements', async () => {
    await writeFile(path.join(root, 'a.ts'), 'same same');
    await expect(prepareProposal(root, proposal('a.ts', 'same', 'x'))).rejects.toThrow(/único/);
    await expect(prepareProposal(root, proposal('a.ts', 'missing', 'x'))).rejects.toThrow(/cambió/);
  });
  it('allows creation only when the target is absent', async () => {
    expect((await prepareProposal(root, proposal('sub/new.ts', '', 'hello')))[0].exists).toBe(false);
    await writeFile(path.join(root, 'a.ts'), '');
    await expect(prepareProposal(root, proposal('a.ts', '', 'overwrite'))).rejects.toThrow(/archivo nuevo/);
  });
  it('rejects invalid JSON, binary content, empty edits and unchanged edits', async () => {
    expect(() => parseProposal('not json')).toThrow(/JSON/);
    expect(() => parseProposal('{"summary":"x","edits":[]}')).toThrow();
    expect(() => proposal('a.ts', 'a', '\0')).toThrow();
    await writeFile(path.join(root, 'a.ts'), 'a');
    await expect(prepareProposal(root, proposal('a.ts', 'a', 'a'))).rejects.toThrow(/No hay cambios/);
  });
  it.each(['../secret', '/absolute', 'C:\\Windows\\test', '\\\\server\\share', 'a/../b', 'a:b', 'a/CON.txt', 'a/nul', 'trailing.', '.env', 'nested/.env.production', 'key.pem', 'node_modules/a.js'])('blocks unsafe path %s', relative => {
    expect(() => validateRelativePath(relative)).toThrow();
  });
  it('blocks ignored parent directories and respects a nested re-inclusion', async () => {
    await mkdir(path.join(root, 'sub')); await mkdir(path.join(root, 'private'));
    await writeFile(path.join(root, '.gitignore'), '*.log\nprivate/\n');
    await writeFile(path.join(root, 'sub/.gitignore'), '!keep.log\n');
    await writeFile(path.join(root, 'sub/keep.log'), 'test');
    await expect(safeWorkspacePath(root, 'sub/keep.log')).resolves.toBe(path.join(root, 'sub/keep.log'));
    await expect(safeWorkspacePath(root, 'sub/drop.log')).rejects.toThrow(/ignorado/);
    await expect(safeWorkspacePath(root, 'private/a.ts')).rejects.toThrow(/ignorado/);
  });
  it('rejects directory junctions before reading a target', async () => {
    await mkdir(path.join(root, 'actual'));
    await symlink(path.join(root, 'actual'), path.join(root, 'link'), 'junction');
    await expect(safeWorkspacePath(root, 'link/a.ts')).rejects.toThrow(/simbólicos/);
  });
});
