import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PORTFOLIO,
  MAX_MATCHES,
  isBlockedRepo,
  isInternalRecipient,
  collectCandidates,
  parsePortfolioResponse,
  generatePortfolioMatches,
} from '../src/lib/portfolio';
import type { EnrichedRepo, TrendingDigest } from '../src/types';

const makeRepo = (fullName: string, description = 'A useful tool'): EnrichedRepo => ({
  owner: fullName.split('/')[0],
  name: fullName.split('/')[1],
  fullName,
  description,
  language: 'TypeScript',
  stars: 100,
  forks: 10,
  periodStars: 5,
  periodLabel: 'today',
  url: `https://github.com/${fullName}`,
  readme: null,
  aiSummary: null,
  meta: null,
});

const names = ['a/one', 'a/two', 'a/three', 'a/four', 'a/five', 'a/six', 'a/seven'];
const candidates = names.map((n) => ({ fullName: n, description: 'd', url: `https://github.com/${n}` }));
const pid = PORTFOLIO[0].id;

describe('parsePortfolioResponse', () => {
  it('parses valid items and fills label and url', () => {
    const out = parsePortfolioResponse(JSON.stringify([{ repo: 'a/one', project: pid, use: 'Faydali.' }]), candidates);
    expect(out).toEqual([
      { repo: 'a/one', projectId: pid, projectLabel: PORTFOLIO[0].label, use: 'Faydali.', url: 'https://github.com/a/one' },
    ]);
  });

  it('drops unknown repos and unknown project ids', () => {
    const out = parsePortfolioResponse(
      JSON.stringify([
        { repo: 'x/unknown', project: pid, use: 'x' },
        { repo: 'a/one', project: 'no-such-project', use: 'x' },
        { repo: 'a/two', project: pid, use: 'ok' },
      ]),
      candidates,
    );
    expect(out?.map((m) => m.repo)).toEqual(['a/two']);
  });

  it('drops empty and over-200-char use text, keeps exactly 200', () => {
    const out = parsePortfolioResponse(
      JSON.stringify([
        { repo: 'a/one', project: pid, use: '   ' },
        { repo: 'a/two', project: pid, use: 'x'.repeat(201) },
        { repo: 'a/three', project: pid, use: 'x'.repeat(200) },
      ]),
      candidates,
    );
    expect(out?.map((m) => m.repo)).toEqual(['a/three']);
  });

  it('caps at 5 matches', () => {
    const items = names.map((repo) => ({ repo, project: pid, use: 'ok' }));
    const out = parsePortfolioResponse(JSON.stringify(items), candidates);
    expect(out).toHaveLength(MAX_MATCHES);
  });

  it('drops duplicate repos and non-object items', () => {
    const out = parsePortfolioResponse(
      JSON.stringify([null, 'str', { repo: 'a/one', project: pid, use: 'a' }, { repo: 'A/ONE', project: pid, use: 'b' }]),
      candidates,
    );
    expect(out).toHaveLength(1);
  });

  it('returns null for non-JSON and empty input', () => {
    expect(parsePortfolioResponse('', candidates)).toBeNull();
    expect(parsePortfolioResponse('no json here', candidates)).toBeNull();
    expect(parsePortfolioResponse('[not valid json]', candidates)).toBeNull();
  });

  it('returns an empty array for an empty JSON list', () => {
    expect(parsePortfolioResponse('[]', candidates)).toEqual([]);
  });

  it('tolerates code fences, prose and think tags around the array', () => {
    const arr = JSON.stringify([{ repo: 'a/one', project: pid, use: 'ok' }]);
    expect(parsePortfolioResponse('```json\n' + arr + '\n```', candidates)).toHaveLength(1);
    expect(parsePortfolioResponse('Iste sonuc:\n' + arr + '\nUmarim yardimci olur.', candidates)).toHaveLength(1);
    expect(parsePortfolioResponse('<think>[1,2]</think>' + arr, candidates)).toHaveLength(1);
  });
});

describe('isBlockedRepo', () => {
  it('blocks jailbreak and NSFW repos', () => {
    expect(isBlockedRepo('YuJunZhiXue/dsh-purge', 'Jailbreak for every model')).toBe(true);
    expect(isBlockedRepo('x/nsfw-gen', 'images')).toBe(true);
    expect(isBlockedRepo('x/y', 'an uncensored model')).toBe(true);
  });

  it('passes normal repos', () => {
    expect(isBlockedRepo('anthropics/claude-code', 'Agentic coding tool in your terminal')).toBe(false);
  });
});

describe('collectCandidates', () => {
  it('dedupes across periods and skips blocked repos', () => {
    const digest: TrendingDigest = {
      daily: [makeRepo('a/one'), makeRepo('b/jailbreak-kit', 'Jailbreak')],
      weekly: [makeRepo('a/one'), makeRepo('a/two')],
      monthly: [],
      generatedAt: 'x',
    };
    expect(collectCandidates(digest).map((c) => c.fullName)).toEqual(['a/one', 'a/two']);
  });
});

describe('isInternalRecipient', () => {
  it('accepts internal domains, including comma lists', () => {
    expect(isInternalRecipient('dev@glossgo.com')).toBe(true);
    expect(isInternalRecipient('a@softween.com, b@getfund.space')).toBe(true);
  });

  it.each([
    'x@gmail.com',
    'dev@glossgo.com, x@gmail.com',
    'dev@evil-glossgo.com',
    'dev@glossgo.com.evil.io',
    'Name <dev@glossgo.com>',
    '',
  ])('rejects %j', (to) => {
    expect(isInternalRecipient(to)).toBe(false);
  });
});

describe('generatePortfolioMatches', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const digest: TrendingDigest = { daily: [makeRepo('a/one')], weekly: [], monthly: [], generatedAt: 'x' };

  it('returns matches from a valid AI response', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({ response: JSON.stringify([{ repo: 'a/one', project: pid, use: 'ok' }]) }),
    } as unknown as Ai;
    const out = await generatePortfolioMatches(ai, digest);
    expect(out?.[0].repo).toBe('a/one');
  });

  it('returns null when the AI binding throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ai = { run: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as Ai;
    expect(await generatePortfolioMatches(ai, digest)).toBeNull();
  });

  it('returns null when the AI never responds (30s timeout)', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ai = { run: vi.fn().mockReturnValue(new Promise(() => {})) } as unknown as Ai;
    const p = generatePortfolioMatches(ai, digest);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await p).toBeNull();
  });

  it('returns null without calling the AI when no candidates remain', async () => {
    const ai = { run: vi.fn() } as unknown as Ai;
    const blocked: TrendingDigest = { ...digest, daily: [makeRepo('b/nsfw-thing')] };
    expect(await generatePortfolioMatches(ai, blocked)).toBeNull();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('returns null when the response has no usable matches', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const ai = { run: vi.fn().mockResolvedValue({ response: '[]' }) } as unknown as Ai;
    expect(await generatePortfolioMatches(ai, digest)).toBeNull();
  });
});
