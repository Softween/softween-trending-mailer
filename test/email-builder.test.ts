import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  formatNumber,
  buildEmailSubject,
  buildEmailHtml,
  COMPACT_LIMIT,
  MAX_HTML_BYTES,
} from '../src/lib/email-builder';
import type { PortfolioMatch } from '../src/lib/portfolio';
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
    expect(html).toContain('Günlük Trending');
    expect(html).toContain('Haftalık Trending');
    expect(html).toContain('Aylık Trending');
  });

  it('renders the executive summary when provided', () => {
    const html = buildEmailHtml(digest, execSummary);
    expect(html).toContain('Yönetici Özeti');
    expect(html).toContain('Gunun one cikan reposu daily/repo.');
    expect(html).toContain('Agent araclari');
  });

  it('omits the executive summary block when absent', () => {
    expect(buildEmailHtml(digest, null)).not.toContain('Yönetici Özeti');
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
    expect(weeklyHtml).not.toContain('KULLANIM ÖRNEĞİ');
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

  // Production cards carry long Turkish AI copy: a 17-card digest measured
  // 95,433 bytes live on 2026-07-27. Short synthetic strings hide that, so the
  // size guard must use realistic content lengths.
  const makeFatRepo = (fullName: string): EnrichedRepo =>
    makeEnrichedRepo({
      fullName,
      description: 'Gercekci uzunlukta bir repo aciklamasi. '.repeat(3),
      aiSummary: {
        summary: 'Bu proje ne yapiyor, nasil calisiyor ve neden onemli oldugunu anlatan uzun bir ozet. '.repeat(5),
        targetAudience: 'Belirli bir hedef kitle tanimi, birkac cumleyle acikca yazilmis hali. '.repeat(2),
        highlights: [
          'Teknik ozellik birinci, gercekci uzunlukta yazilmis bir madde. '.repeat(2),
          'Teknik ozellik ikinci, gercekci uzunlukta yazilmis bir madde. '.repeat(2),
          'Teknik ozellik ucuncu, gercekci uzunlukta yazilmis bir madde. '.repeat(2),
        ],
        usageExample: 'Somut bir kullanim senaryosu: hangi rol, hangi gorev, hangi fayda. '.repeat(4),
        category: 'AI/ML',
      },
    });

  const fatPeriod = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => makeFatRepo(`${prefix}/repo-${i}`));

  it('stays under the byte budget with realistic content at production scale', () => {
    const html = buildEmailHtml(
      {
        daily: fatPeriod('daily', 20),
        weekly: fatPeriod('weekly', 25),
        monthly: fatPeriod('monthly', 25),
        generatedAt: '15 Mart 2025, 10:00',
      },
      execSummary,
    );
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(MAX_HTML_BYTES);
  });

  it('holds the budget even when every period is oversized', () => {
    const html = buildEmailHtml(
      {
        daily: fatPeriod('daily', 75),
        weekly: fatPeriod('weekly', 75),
        monthly: fatPeriod('monthly', 75),
        generatedAt: '15 Mart 2025, 10:00',
      },
      execSummary,
    );
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(MAX_HTML_BYTES);
    // Degrades by demoting daily cards, not by dropping them silently
    expect(html).toContain('Günlük Trending (devami)');
  });

  it('renders the new Turkish labels', () => {
    const html = buildEmailHtml(digest, execSummary);
    expect(html).toContain('Günlük, Haftalık ve Aylık trendler');
    expect(html).toContain('TEMEL ÖZELLİKLER');
    expect(html).toContain('KULLANIM ÖRNEĞİ');
    expect(html).toContain("GitHub'da Gör");
    expect(html).not.toContain('TEMEL OZELLIKLER');
    expect(html).not.toContain("GitHub'da Gor");
  });

  describe('portfolio section', () => {
    const match = (i: number, use = `Somut kullanim ${i}`): PortfolioMatch => ({
      repo: `owner/repo-${i}`,
      projectId: 'glossgo-be',
      projectLabel: 'glossgo-be',
      use,
      url: `https://github.com/owner/repo-${i}`,
    });

    it('renders after the executive summary and before the daily section', () => {
      const html = buildEmailHtml(digest, execSummary, undefined, [match(1)]);
      const exec = html.indexOf('Yönetici Özeti');
      const port = html.indexOf('Portföy eşleşmesi');
      const daily = html.indexOf('Günlük Trending');
      expect(exec).toBeGreaterThan(-1);
      expect(port).toBeGreaterThan(exec);
      expect(daily).toBeGreaterThan(port);
      expect(html).toContain('owner/repo-1');
      expect(html).toContain('Somut kullanim 1');
    });

    it('is absent when null, undefined or empty', () => {
      expect(buildEmailHtml(digest, execSummary, undefined, null)).not.toContain('Portföy eşleşmesi');
      expect(buildEmailHtml(digest, execSummary)).not.toContain('Portföy eşleşmesi');
      expect(buildEmailHtml(digest, execSummary, undefined, [])).not.toContain('Portföy eşleşmesi');
    });

    it('escapes HTML in the use text exactly once', () => {
      const html = buildEmailHtml(digest, null, undefined, [match(1, 'a < b & <script>x</script>')]);
      expect(html).toContain('a &lt; b &amp; &lt;script&gt;x&lt;/script&gt;');
      expect(html).not.toContain('&amp;lt;');
      expect(html).not.toContain('&amp;amp;');
      expect(html).not.toContain('<script>');
    });

    it('keeps the byte budget with an oversized digest and 5 matches', () => {
      const fat = (prefix: string, n: number) =>
        Array.from({ length: n }, (_, i) =>
          makeEnrichedRepo({
            fullName: `${prefix}/repo-${i}`,
            aiSummary: {
              summary: 'Uzun ozet metni burada yer aliyor. '.repeat(10),
              targetAudience: 'Hedef kitle tanimi. '.repeat(5),
              highlights: ['Teknik ozellik maddesi gercekci uzunlukta. '.repeat(3)],
              usageExample: 'Somut kullanim senaryosu. '.repeat(10),
              category: 'AI/ML',
            },
          }),
        );
      const html = buildEmailHtml(
        { daily: fat('daily', 75), weekly: fat('weekly', 75), monthly: fat('monthly', 75), generatedAt: 'x' },
        execSummary,
        'https://example.com/unsub',
        [1, 2, 3, 4, 5].map((i) => match(i, 'Kullanim aciklamasi. '.repeat(9))),
      );
      expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(MAX_HTML_BYTES);
      expect(html).toContain('Portföy eşleşmesi');
    });
  });

  it('renders valid HTML structure', () => {
    const html = buildEmailHtml(digest, execSummary);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('</html>');
  });
});
