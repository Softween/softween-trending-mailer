import { describe, it, expect } from 'vitest';
import { buildExecSummaryPrompt, parseExecSummaryResponse } from '../src/lib/exec-summary';
import type { EnrichedRepo, TrendingDigest } from '../src/types';

const makeRepo = (fullName: string, overrides: Partial<EnrichedRepo> = {}): EnrichedRepo => ({
  owner: fullName.split('/')[0],
  name: fullName.split('/')[1],
  fullName,
  description: 'Test description',
  language: 'Rust',
  stars: 5000,
  forks: 300,
  periodStars: 120,
  periodLabel: 'today',
  url: `https://github.com/${fullName}`,
  readme: null,
  aiSummary: null,
  meta: null,
  ...overrides,
});

const digest: TrendingDigest = {
  daily: [makeRepo('block/buzz')],
  weekly: [makeRepo('diegosouzapw/OmniRoute')],
  monthly: [],
  generatedAt: '26 Temmuz 2026, 07:00',
};

describe('buildExecSummaryPrompt', () => {
  it('lists repos per period and marks empty periods', () => {
    const prompt = buildExecSummaryPrompt(digest);
    expect(prompt).toContain('GUNLUK');
    expect(prompt).toContain('block/buzz');
    expect(prompt).toContain('diegosouzapw/OmniRoute');
    expect(prompt).toContain('AYLIK: veri yok');
  });

  it('prefers the AI summary over the raw description', () => {
    const repo = makeRepo('with/summary', {
      description: 'raw description',
      aiSummary: {
        summary: 'AI tarafindan yazilmis ozet',
        targetAudience: 'Gelistiriciler',
        highlights: [],
        usageExample: '',
        category: 'AI/ML',
      },
    });
    const prompt = buildExecSummaryPrompt({ ...digest, daily: [repo] });
    expect(prompt).toContain('AI tarafindan yazilmis ozet');
    expect(prompt).not.toContain('raw description');
  });
});

describe('parseExecSummaryResponse', () => {
  it('parses a clean JSON response', () => {
    const parsed = parseExecSummaryResponse(
      '{"overview":"Gunun ozeti","themes":[{"title":"Agent","body":"block/buzz one cikti"}]}',
    );
    expect(parsed?.overview).toBe('Gunun ozeti');
    expect(parsed?.themes).toHaveLength(1);
    expect(parsed?.themes[0].title).toBe('Agent');
  });

  it('strips think tags and surrounding prose', () => {
    const parsed = parseExecSummaryResponse(
      '<think>reasoning here</think>Iste sonuc:\n{"overview":"Ozet","themes":[]}',
    );
    expect(parsed?.overview).toBe('Ozet');
    expect(parsed?.themes).toEqual([]);
  });

  it('drops malformed themes but keeps the overview', () => {
    const parsed = parseExecSummaryResponse(
      '{"overview":"Ozet","themes":[{"title":"Ok","body":"gecerli"},{"title":""},null,"metin",{"body":"baslik yok"}]}',
    );
    expect(parsed?.themes).toHaveLength(1);
    expect(parsed?.themes[0].body).toBe('gecerli');
  });

  it('returns null when overview is missing, empty or unparsable', () => {
    expect(parseExecSummaryResponse('{"themes":[]}')).toBeNull();
    expect(parseExecSummaryResponse('{"overview":"   ","themes":[]}')).toBeNull();
    expect(parseExecSummaryResponse('not json at all')).toBeNull();
    expect(parseExecSummaryResponse('')).toBeNull();
  });
});
