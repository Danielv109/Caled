import { describe, expect, it } from 'vitest';
import { renderHome } from '../src/ui/home';

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
    expect(english.match(/data-action="profile"/g)).toHaveLength(5);
    expect(renderHome(nonce, 'es')).toContain('Crear mi primer proyecto');
  });
});
