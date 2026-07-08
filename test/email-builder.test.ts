import { describe, it, expect } from 'vitest';
import { escapeHtml, formatNumber, buildEmailSubject, buildEmailHtml } from '../src/lib/email-builder';
import type { EnrichedRepo, TrendingDigest } from '../src/types';

const makeEnrichedRepo = (overrides: Partial<EnrichedRepo> = {}): EnrichedRepo => ({
  owner: 'test',
  name: 'repo',
  fullName: 'test/repo',
  description: 'Test description',
  language: 'TypeScript',
  stars: 5000,
  forks: 300,
  periodStars: 100,
  periodLabel: 'today',
  url: 'https://github.com/test/repo',
  readme: null,
  aiSummary: {
    summary: 'Ozet metni',
    targetAudience: 'Gelistiriciler',
    highlights: ['Feature 1', 'Feature 2'],
    usageExample: 'Bir backend gelistirici bu araciyla API testlerini otomatize edebilir.',
    category: 'AI/ML',
  },
  meta: null,
  ...overrides,
});

describe('formatNumber', () => {
  it('numbers below 1000 returned as-is', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(999)).toBe('999');
  });

  it('numbers >= 1000 and < 10000 formatted with k', () => {
    expect(formatNumber(1000)).toBe('1.0k');
    expect(formatNumber(1500)).toBe('1.5k');
    expect(formatNumber(9999)).toBe('10.0k');
  });

  it('numbers >= 10000 formatted with k', () => {
    expect(formatNumber(10000)).toBe('10.0k');
    expect(formatNumber(25690)).toBe('25.7k');
    expect(formatNumber(100000)).toBe('100.0k');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<div class="x">&</div>')).toBe('&lt;div class=&quot;x&quot;&gt;&amp;&lt;/div&gt;');
  });

  it('returns same string if no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('buildEmailSubject', () => {
  it('includes formatted Turkish date and period label', () => {
    const date = new Date('2025-03-15T10:00:00Z');
    const daily = buildEmailSubject(date, 'daily');
    expect(daily).toContain('GitHub Trending Digest');
    expect(daily).toContain('(Gunluk)');
    expect(daily).toContain('Mart');

    expect(buildEmailSubject(date, 'weekly')).toContain('(Haftalik)');
    expect(buildEmailSubject(date, 'monthly')).toContain('(Aylik)');
  });
});

describe('buildEmailHtml', () => {
  const digest: TrendingDigest = {
    daily: [makeEnrichedRepo({ fullName: 'daily/repo' })],
    weekly: [makeEnrichedRepo({ fullName: 'weekly/repo' })],
    monthly: [makeEnrichedRepo({ fullName: 'monthly/repo' })],
    generatedAt: '15 Mart 2025, 10:00',
  };

  it('renders only the selected period section', () => {
    const html = buildEmailHtml(digest, 'monthly');
    expect(html).toContain('Aylik Trending');
    expect(html).toContain('monthly/repo');
    expect(html).not.toContain('daily/repo');
    expect(html).not.toContain('weekly/repo');
    expect(html).toContain('1 repo');
  });

  it('includes AI summary content for the selected period', () => {
    const repo = makeEnrichedRepo({
      aiSummary: {
        summary: 'AI ozet icerigi',
        targetAudience: 'Backend gelistiricileri',
        highlights: ['Highlight A', 'Highlight B'],
        usageExample: 'DevOps muhendisi CI/CD pipeline kurarak deploy surecini hizlandirabilir.',
        category: 'AI/ML',
      },
    });
    const html = buildEmailHtml({ ...digest, daily: [repo] }, 'daily');
    expect(html).toContain('AI ozet icerigi');
    expect(html).toContain('Backend gelistiricileri');
    expect(html).toContain('Highlight A');
  });

  it('renders valid HTML structure', () => {
    const html = buildEmailHtml(digest, 'daily');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('</html>');
  });
});
