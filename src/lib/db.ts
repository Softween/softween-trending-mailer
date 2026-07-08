import type { EnrichedRepo, TimeRange } from '../types';

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}_${random}`;
}

export async function saveSnapshot(
  db: D1Database,
  date: string,
  repos: { daily: EnrichedRepo[]; weekly: EnrichedRepo[]; monthly: EnrichedRepo[] },
): Promise<string> {
  // Delete existing snapshot for this date (replace, not duplicate)
  const existing = await db
    .prepare('SELECT id FROM trending_snapshots WHERE date = ?')
    .bind(date)
    .first<{ id: string }>();

  if (existing) {
    await db.prepare('DELETE FROM trending_repos WHERE snapshot_id = ?').bind(existing.id).run();
    await db.prepare('DELETE FROM trending_snapshots WHERE id = ?').bind(existing.id).run();
    console.log(`[db] Replaced existing snapshot ${existing.id} for ${date}`);
  }

  const snapshotId = generateId();
  const totalCount = repos.daily.length + repos.weekly.length + repos.monthly.length;

  await db
    .prepare('INSERT INTO trending_snapshots (id, date, repo_count) VALUES (?, ?, ?)')
    .bind(snapshotId, date, totalCount)
    .run();

  const insertRepo = db.prepare(
    `INSERT INTO trending_repos (id, snapshot_id, period, rank, full_name, owner, name, description, language, stars, forks, period_stars, period_label, url, readme, ai_summary, repo_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const batches: D1PreparedStatement[] = [];

  const addRepos = (repoList: EnrichedRepo[], period: TimeRange) => {
    repoList.forEach((repo, index) => {
      batches.push(
        insertRepo.bind(
          generateId(),
          snapshotId,
          period,
          index + 1,
          repo.fullName,
          repo.owner,
          repo.name,
          repo.description,
          repo.language,
          repo.stars,
          repo.forks,
          repo.periodStars,
          repo.periodLabel,
          repo.url,
          repo.readme,
          repo.aiSummary ? JSON.stringify(repo.aiSummary) : null,
          repo.meta ? JSON.stringify(repo.meta) : null,
        ),
      );
    });
  };

  addRepos(repos.daily, 'daily');
  addRepos(repos.weekly, 'weekly');
  addRepos(repos.monthly, 'monthly');

  for (let i = 0; i < batches.length; i += 100) {
    await db.batch(batches.slice(i, i + 100));
  }

  console.log(`[db] Saved snapshot ${snapshotId} with ${totalCount} repos for ${date}`);
  return snapshotId;
}

export async function getActiveSubscribers(
  db: D1Database,
): Promise<Array<{ email: string; unsubscribe_token: string }>> {
  const result = await db
    .prepare(
      'SELECT email, unsubscribe_token FROM subscribers WHERE active = 1 AND confirmed = 1 AND unsubscribe_token IS NOT NULL',
    )
    .all<{ email: string; unsubscribe_token: string }>();
  return result.results ?? [];
}
