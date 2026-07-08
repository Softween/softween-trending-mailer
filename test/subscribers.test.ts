import { describe, it, expect } from 'vitest';
import { getActiveSubscribers } from '../src/lib/db';

function fakeDb(rows: Array<{ email: string; unsubscribe_token: string }>) {
  return {
    prepare() {
      return {
        bind() { return this; },
        async all<T>() { return { results: rows as T[] }; },
      };
    },
  } as unknown as D1Database;
}

describe('getActiveSubscribers', () => {
  it('returns mapped subscriber rows', async () => {
    const rows = [{ email: 'a@x.com', unsubscribe_token: 't1' }];
    expect(await getActiveSubscribers(fakeDb(rows))).toEqual(rows);
  });
  it('returns [] when no rows', async () => {
    expect(await getActiveSubscribers(fakeDb([]))).toEqual([]);
  });
});
