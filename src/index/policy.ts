import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import ignore, { type Ignore } from 'ignore';

export const MAX_FILE_BYTES = 128 * 1024;
export const BASE_IGNORES = [
  '.git/', '.svn/', '.hg/', 'node_modules/', 'vendor/', 'dist/', 'build/', 'out/',
  'coverage/', '.next/', '.venv/', 'venv/', '__pycache__/', '.cache/', '.runtime/',
  '.upstream/', '.idea/', '.caled/', '.DS_Store', '*.lock', '*-lock.json',
  '.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', '*.keystore',
  '**/id_rsa*', '**/id_ed25519*', '**/credentials*', '**/secrets*',
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.ico', '*.pdf', '*.zip',
  '*.exe', '*.dll', '*.so', '*.dylib', '*.mp4', '*.mp3', '*.woff*', '*.ttf', '*.map', '*.sqlite*', '*.db'
];
export const normalizePath = (value: string) => value.replace(/\\/g, '/');
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}
export function validateRelativePath(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f\u007f<>:"|?*]/.test(value)) throw new Error('Ruta de archivo no válida.');
  const rel = normalizePath(value);
  if (rel.startsWith('/') || rel.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\.|$)/i.test(p))) throw new Error('La ruta debe estar dentro del proyecto.');
  if (ignore().add(BASE_IGNORES).ignores(rel)) throw new Error(`Archivo excluido: ${rel}`);
  return rel;
}
export async function readIgnore(directory: string): Promise<Ignore> {
  const matcher = ignore();
  for (const name of ['.gitignore', '.caledignore']) {
    try {
      const filename = path.join(directory, name);
      const info = await lstat(filename);
      if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_FILE_BYTES) throw new Error(`Archivo de exclusiones no seguro o demasiado grande: ${name}`);
      const content = await readFile(filename, 'utf8');
      if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error(`Archivo de exclusiones demasiado grande: ${name}`);
      matcher.add(content);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return matcher;
}
export interface IgnoreLayer { root: string; ignore: Ignore }
/** Later .gitignore/.caledignore layers may re-include files, but not excluded parents. */
export function ignoredByLayers(absolute: string, directory: boolean, layers: IgnoreLayer[]): boolean {
  let ignored = false;
  for (const layer of layers) {
    const result = layer.ignore.test(normalizePath(path.relative(layer.root, absolute)) + (directory ? '/' : ''));
    if (result.ignored) ignored = true;
    else if (result.unignored) ignored = false;
  }
  return ignored;
}
export async function safeWorkspacePath(root: string, relative: string): Promise<string> {
  const rel = validateRelativePath(relative);
  const actualRoot = await realpath(root);
  const target = path.resolve(actualRoot, rel);
  if (!isInside(actualRoot, target)) throw new Error('Ruta fuera del proyecto.');
  const parts = rel.split('/');
  let cursor = actualRoot;
  const layers: IgnoreLayer[] = [];
  for (let i = 0; i < parts.length; i++) {
    layers.push({ root: cursor, ignore: await readIgnore(cursor) });
    cursor = path.join(cursor, parts[i]);
    if (ignoredByLayers(cursor, i < parts.length - 1, layers)) throw new Error(`Archivo ignorado: ${rel}`);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error(`No se accede a enlaces simbólicos: ${rel}`);
      if (i === parts.length - 1 && !info.isFile()) throw new Error('La ruta no es un archivo regular.');
      if (i < parts.length - 1 && !info.isDirectory()) throw new Error('Un componente de la ruta no es un directorio.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}
