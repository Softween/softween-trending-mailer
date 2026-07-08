import { describe, it, expect } from 'vitest';
import { buildEmailHtml } from '../src/lib/email-builder';
import type { TrendingDigest } from '../src/types';

const digest = {
  generatedAt: '2026-07-08',
  daily: [], weekly: [], monthly: [],
} as unknown as TrendingDigest;

describe('unsubscribe footer', () => {
  it('includes personalized unsubscribe link when url provided', () => {
    const html = buildEmailHtml(digest, 'daily', 'https://trends.softween.com/abonelik-iptal?token=abc');
    expect(html).toContain('abonelik-iptal?token=abc');
    expect(html.toLowerCase()).toContain('abonelik');
  });
  it('omits unsubscribe link when url not provided (internal copy)', () => {
    const html = buildEmailHtml(digest, 'daily');
    expect(html).not.toContain('abonelik-iptal?token=');
  });
});
