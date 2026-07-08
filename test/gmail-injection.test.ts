import { describe, it, expect } from 'vitest';
import { assertValidRecipient } from '../src/lib/gmail';

describe('assertValidRecipient', () => {
  it('throws on CRLF header injection attempt', () => {
    expect(() =>
      assertValidRecipient('victim@x.com\r\nBcc: attacker@evil.com'),
    ).toThrow();
  });

  it('throws on bare LF injection attempt', () => {
    expect(() =>
      assertValidRecipient('victim@x.com\nBcc: attacker@evil.com'),
    ).toThrow();
  });

  it('throws on malformed email address', () => {
    expect(() => assertValidRecipient('not-an-email')).toThrow();
  });

  it('passes for a clean, valid email address', () => {
    expect(() => assertValidRecipient('victim@x.com')).not.toThrow();
  });
});
