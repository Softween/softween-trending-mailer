import { describe, it, expect } from 'vitest';
import { parseSummaryResponse, stripThinkTags, fallbackSummary, buildUserPrompt } from '../src/lib/ai-summarizer';
import type { TrendingRepo } from '../src/types';

const makeRepo = (overrides: Partial<TrendingRepo> = {}): TrendingRepo => ({
  owner: 'test-owner',
  name: 'test-repo',
  fullName: 'test-owner/test-repo',
  description: 'A test repository',
  language: 'TypeScript',
  stars: 1500,
  forks: 200,
  periodStars: 300,
  periodLabel: 'today',
  url: 'https://github.com/test-owner/test-repo',
  ...overrides,
});

describe('parseSummaryResponse', () => {
  it('valid JSON returns RepoSummary', () => {
    const json = JSON.stringify({
      summary: 'Bu bir test ozeti.',
      targetAudience: 'TypeScript gelistiricileri',
      highlights: ['feature 1', 'feature 2', 'feature 3'],
    });
    const result = parseSummaryResponse(json);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Bu bir test ozeti.');
    expect(result!.targetAudience).toBe('TypeScript gelistiricileri');
    expect(result!.highlights).toEqual(['feature 1', 'feature 2', 'feature 3']);
  });

  it('JSON with think tags strips and parses correctly', () => {
    const json = `<think>Some internal reasoning here...</think>{"summary":"Ozet","targetAudience":"Hedef kitle","highlights":["a","b","c"]}`;
    const result = parseSummaryResponse(json);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Ozet');
  });

  it('invalid JSON returns null', () => {
    const result = parseSummaryResponse('this is not json at all');
    expect(result).toBeNull();
  });

  it('JSON with non-string highlights returns null', () => {
    const json = JSON.stringify({
      summary: 'Ozet',
      targetAudience: 'Kitle',
      highlights: [1, 2, 3],
    });
    const result = parseSummaryResponse(json);
    expect(result).toBeNull();
  });

  it('multiple JSON objects picks last one', () => {
    const first = JSON.stringify({
      summary: 'First',
      targetAudience: 'First audience',
      highlights: ['a'],
    });
    const second = JSON.stringify({
      summary: 'Second',
      targetAudience: 'Second audience',
      highlights: ['b'],
    });
    const text = `Some preamble ${first} more text ${second}`;
    const result = parseSummaryResponse(text);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Second');
  });

  it('empty string returns null', () => {
    const result = parseSummaryResponse('');
    expect(result).toBeNull();
  });
});

describe('stripThinkTags', () => {
  it('removes think tags and their content', () => {
    const input = '<think>internal reasoning</think>actual content';
    expect(stripThinkTags(input)).toBe('actual content');
  });

  it('no think tags returns same string trimmed', () => {
    const input = 'just plain text';
    expect(stripThinkTags(input)).toBe('just plain text');
  });

  it('removes multiple think tags', () => {
    const input = '<think>first</think>middle<think>second</think>end';
    expect(stripThinkTags(input)).toBe('middleend');
  });

  it('removes multiline think tags', () => {
    const input = '<think>\nline1\nline2\n</think>result';
    expect(stripThinkTags(input)).toBe('result');
  });
});

describe('fallbackSummary', () => {
  it('creates fallback with description', () => {
    const repo = makeRepo({ description: 'A great tool for developers' });
    const result = fallbackSummary(repo);
    expect(result.summary).toContain('A great tool for developers');
    expect(result.summary).toContain('1,500');
    expect(result.targetAudience).toContain('TypeScript');
    expect(result.highlights).toHaveLength(3);
    expect(result.highlights[0]).toBe('A great tool for developers');
  });

  it('creates fallback without description', () => {
    const repo = makeRepo({ description: '' });
    const result = fallbackSummary(repo);
    expect(result.summary).toContain('test-owner/test-repo');
    expect(result.summary).toContain('TypeScript');
    expect(result.highlights[0]).toContain('TypeScript');
  });
});

describe('buildUserPrompt', () => {
  it('includes repo metadata', () => {
    const repo = makeRepo();
    const prompt = buildUserPrompt(repo, null);
    expect(prompt).toContain('test-owner/test-repo');
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('A test repository');
  });

  it('includes readme when provided', () => {
    const repo = makeRepo();
    const prompt = buildUserPrompt(repo, '# My Readme\nSome content');
    expect(prompt).toContain('README icerigi');
    expect(prompt).toContain('# My Readme');
  });

  it('omits readme section when null', () => {
    const repo = makeRepo();
    const prompt = buildUserPrompt(repo, null);
    expect(prompt).not.toContain('README icerigi');
  });
});
