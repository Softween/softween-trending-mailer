import { describe, it, expect } from 'vitest';
import { deduplicateRepos } from '../src/index';
import type { TrendingRepo } from '../src/types';

const makeRepo = (fullName: string, overrides: Partial<TrendingRepo> = {}): TrendingRepo => {
  const [owner, name] = fullName.split('/');
  return {
    owner,
    name,
    fullName,
    description: `Description for ${fullName}`,
    language: 'TypeScript',
    stars: 1000,
    forks: 100,
    periodStars: 50,
    periodLabel: 'today',
    url: `https://github.com/${fullName}`,
    ...overrides,
  };
};

describe('deduplicateRepos', () => {
  it('removes daily repos from weekly', () => {
    const daily = [makeRepo('owner/shared'), makeRepo('owner/daily-only')];
    const weekly = [makeRepo('owner/shared'), makeRepo('owner/weekly-only')];
    const monthly: TrendingRepo[] = [];

    const result = deduplicateRepos(daily, weekly, monthly);
    expect(result.daily).toHaveLength(2);
    expect(result.weekly).toHaveLength(1);
    expect(result.weekly[0].fullName).toBe('owner/weekly-only');
  });

  it('removes daily and weekly repos from monthly', () => {
    const daily = [makeRepo('owner/a')];
    const weekly = [makeRepo('owner/b')];
    const monthly = [makeRepo('owner/a'), makeRepo('owner/b'), makeRepo('owner/c')];

    const result = deduplicateRepos(daily, weekly, monthly);
    expect(result.monthly).toHaveLength(1);
    expect(result.monthly[0].fullName).toBe('owner/c');
  });

  it('handles empty arrays', () => {
    const result = deduplicateRepos([], [], []);
    expect(result.daily).toEqual([]);
    expect(result.weekly).toEqual([]);
    expect(result.monthly).toEqual([]);
  });

  it('preserves order within each period', () => {
    const daily = [makeRepo('owner/z'), makeRepo('owner/a'), makeRepo('owner/m')];
    const weekly = [makeRepo('owner/x'), makeRepo('owner/b')];
    const monthly = [makeRepo('owner/y'), makeRepo('owner/c')];

    const result = deduplicateRepos(daily, weekly, monthly);
    expect(result.daily.map((r) => r.fullName)).toEqual(['owner/z', 'owner/a', 'owner/m']);
    expect(result.weekly.map((r) => r.fullName)).toEqual(['owner/x', 'owner/b']);
    expect(result.monthly.map((r) => r.fullName)).toEqual(['owner/y', 'owner/c']);
  });

  it('daily remains unchanged regardless of overlap', () => {
    const daily = [makeRepo('owner/a'), makeRepo('owner/b')];
    const weekly = [makeRepo('owner/a')];
    const monthly = [makeRepo('owner/b')];

    const result = deduplicateRepos(daily, weekly, monthly);
    expect(result.daily).toHaveLength(2);
    expect(result.weekly).toHaveLength(0);
    expect(result.monthly).toHaveLength(0);
  });

  it('weekly duplicates also removed from monthly', () => {
    const daily: TrendingRepo[] = [];
    const weekly = [makeRepo('owner/w1'), makeRepo('owner/w2')];
    const monthly = [makeRepo('owner/w1'), makeRepo('owner/w2'), makeRepo('owner/m1')];

    const result = deduplicateRepos(daily, weekly, monthly);
    expect(result.weekly).toHaveLength(2);
    expect(result.monthly).toHaveLength(1);
    expect(result.monthly[0].fullName).toBe('owner/m1');
  });
});
