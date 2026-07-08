import { describe, it, expect } from 'vitest';
import { parsePriorityKeywords, sortByPriority } from '../src/lib/priority-ranking';
import type { EnrichedRepo } from '../src/types';

function repo(fullName: string, desc: string, stars: number): EnrichedRepo {
  return {
    owner: 'x', name: fullName, fullName, description: desc, language: 'TypeScript',
    stars, forks: 0, periodStars: stars, periodLabel: 'today', url: '',
    readme: null, aiSummary: null, meta: null,
  } as EnrichedRepo;
}

describe('priority-ranking', () => {
  it('parses empty/undefined to no weights (neutral)', () => {
    expect(parsePriorityKeywords(undefined)).toEqual([]);
    expect(parsePriorityKeywords('')).toEqual([]);
  });

  it('parses "keyword:weight" CSV into regex/weight pairs', () => {
    const w = parsePriorityKeywords('salon:6, pricing:4');
    expect(w.length).toBe(2);
    expect(w[0][1]).toBe(6);
    expect(w[0][0].test('best SALON app')).toBe(true);
  });

  it('with no weights, sorts purely by periodStars desc', () => {
    const out = sortByPriority([repo('a', 'x', 10), repo('b', 'salon', 50)], []);
    expect(out[0].fullName).toBe('b');
  });

  it('boosts keyword matches above higher-star non-matches', () => {
    const w = parsePriorityKeywords('salon:100');
    const out = sortByPriority([repo('a', 'nothing', 999), repo('b', 'salon booking', 1)], w);
    expect(out[0].fullName).toBe('b');
  });
});
