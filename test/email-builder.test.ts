import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  formatNumber,
  buildEmailSubject,
  buildEmailHtml,
  COMPACT_LIMIT,
} from '../src/lib/email-builder';
import type { ExecutiveSummary } from '../src/lib/exec-summary';
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
  it('includes formatted Turkish date without a period label', () => {
    const subject = buildEmailSubject(new Date('2025-03-15T10:00:00Z'));
    expect(subject).toContain('GitHub Trending Digest');
    expect(subject).toContain('Mart');
    expect(subject).not.toContain('Gunluk)');
  });
});

describe('buildEmailHtml', () => {
  const digest: TrendingDigest = {
    daily: [makeEnrichedRepo({ fullName: 'daily/repo' })],
    weekly: [makeEnrichedRepo({ fullName: 'weekly/repo' })],
    monthly: [makeEnrichedRepo({ fullName: 'monthly/repo' })],
    generatedAt: '15 Mart 2025, 10:00',
  };

  const execSummary: ExecutiveSummary = {
    overview: 'Gunun one cikan reposu daily/repo.',
    themes: [{ title: 'Agent araclari', body: 'weekly/repo bu temayi destekliyor.' }],
  };

  it('renders all three periods in one email', () => {
    const html = buildEmailHtml(digest, null);
    expect(html).toContain('daily/repo');
    expect(html).toContain('weekly/repo');
    expect(html).toContain('monthly/repo');
    expect(html).toContain('Gunluk Trending');
    expect(html).toContain('Haftalik Trending');
    expect(html).toContain('Aylik Trending');
  });

  it('renders the executive summary when provided', () => {
    const html = buildEmailHtml(digest, execSummary);
    expect(html).toContain('Yonetici Ozeti');
    expect(html).toContain('Gunun one cikan reposu daily/repo.');
    expect(html).toContain('Agent araclari');
  });

  it('omits the executive summary block when absent', () => {
    expect(buildEmailHtml(digest, null)).not.toContain('Yonetici Ozeti');
  });

  it('gives daily repos full AI detail and keeps weekly/monthly compact', () => {
    const detailed = makeEnrichedRepo({
      fullName: 'detail/repo',
      aiSummary: {
        summary: 'AI ozet icerigi',
        targetAudience: 'Backend gelistiricileri',
        highlights: ['Highlight A', 'Highlight B'],
        usageExample: 'DevOps muhendisi CI/CD pipeline kurarak deploy surecini hizlandirabilir.',
        category: 'AI/ML',
      },
    });

    const dailyHtml = buildEmailHtml({ ...digest, daily: [detailed], weekly: [], monthly: [] }, null);
    expect(dailyHtml).toContain('AI ozet icerigi');
    expect(dailyHtml).toContain('Backend gelistiricileri');
    expect(dailyHtml).toContain('Highlight A');

    const weeklyHtml = buildEmailHtml({ ...digest, daily: [], weekly: [detailed], monthly: [] }, null);
    expect(weeklyHtml).toContain('detail/repo');
    expect(weeklyHtml).not.toContain('Highlight A');
    expect(weeklyHtml).not.toContain('KULLANIM ORNEGI');
  });

  it('caps compact lists and discloses how many were left out', () => {
    const many = Array.from({ length: COMPACT_LIMIT + 7 }, (_, i) =>
      makeEnrichedRepo({ fullName: `weekly/repo-${i}` }),
    );
    const html = buildEmailHtml({ ...digest, weekly: many }, null);
    expect(html).toContain(`weekly/repo-${COMPACT_LIMIT - 1}`);
    expect(html).not.toContain(`weekly/repo-${COMPACT_LIMIT}<`);
    expect(html).toContain('+ 7 repo daha');
    expect(html).toContain('trends.softween.com');
  });

  it('stays under the Gmail 102KB clipping threshold for a large digest', () => {
    const period = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => makeEnrichedRepo({ fullName: `${prefix}/repo-${i}` }));
    const html = buildEmailHtml(
      {
        daily: period('daily', 25),
        weekly: period('weekly', 75),
        monthly: period('monthly', 75),
        generatedAt: '15 Mart 2025, 10:00',
      },
      execSummary,
    );
    expect(new TextEncoder().encode(html).length).toBeLessThan(102_400);
  });

  it('renders valid HTML structure', () => {
    const html = buildEmailHtml(digest, execSummary);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('</html>');
  });
});
