import type { RepoMeta } from '../types';

const MAX_README_LENGTH = 4000;

export async function fetchReadme(
  owner: string,
  repo: string,
  token: string,
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/readme`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3.raw',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GitHub-Trending-Mailer/1.0',
    },
  });

  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  return text.slice(0, MAX_README_LENGTH);
}

export async function fetchReadmesBatch(
  repos: Array<{ owner: string; name: string }>,
  token: string,
  concurrency: number = 10,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  for (let i = 0; i < repos.length; i += concurrency) {
    const batch = repos.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (repo) => {
        const readme = await fetchReadme(repo.owner, repo.name, token);
        return { fullName: `${repo.owner}/${repo.name}`, readme };
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.fullName, result.value.readme);
      } else {
        console.warn(`[github-api] README fetch rejected: ${result.reason}`);
      }
    }
  }

  return results;
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
  token: string,
): Promise<RepoMeta | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GitHub-Trending-Mailer/1.0',
    },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as Record<string, unknown>;
  const license = data.license as { spdx_id?: string } | null;

  return {
    openIssues: (data.open_issues_count as number) ?? 0,
    license: license?.spdx_id ?? '',
    lastPush: (data.pushed_at as string) ?? '',
    createdAt: (data.created_at as string) ?? '',
    topics: ((data.topics as string[]) ?? []).slice(0, 8),
    homepage: (data.homepage as string) ?? '',
    watchers: (data.subscribers_count as number) ?? 0,
  };
}

export async function fetchRepoMetaBatch(
  repos: Array<{ owner: string; name: string }>,
  token: string,
  concurrency: number = 10,
): Promise<Map<string, RepoMeta | null>> {
  const results = new Map<string, RepoMeta | null>();

  for (let i = 0; i < repos.length; i += concurrency) {
    const batch = repos.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (repo) => {
        const meta = await fetchRepoMeta(repo.owner, repo.name, token);
        return { fullName: `${repo.owner}/${repo.name}`, meta };
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.fullName, result.value.meta);
      } else {
        console.warn(`[github-api] Meta fetch rejected: ${result.reason}`);
      }
    }
  }

  return results;
}
