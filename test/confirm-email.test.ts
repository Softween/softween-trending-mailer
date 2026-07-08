import { describe, it, expect } from 'vitest';
import { buildConfirmEmailHtml } from '../src/lib/email-builder';
describe('confirm email', () => {
  it('embeds the confirm url', () => {
    const html = buildConfirmEmailHtml('https://trends.softween.com/abonelik-onayla?token=abc123');
    expect(html).toContain('abonelik-onayla?token=abc123');
    expect(html.toLowerCase()).toContain('onayla');
  });
});
