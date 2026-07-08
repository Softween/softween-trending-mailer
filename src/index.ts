import { Hono } from 'hono';
import type { Env, TrendingRepo, EnrichedRepo, TrendingDigest, RepoSummary, RepoMeta } from './types';
import { fetchTrendingRepos } from './lib/scraper';
import { fetchReadmesBatch, fetchRepoMetaBatch } from './lib/github-api';
import { summarizeReposBatch } from './lib/ai-summarizer';
import { buildEmailHtml, buildEmailSubject, buildConfirmEmailHtml } from './lib/email-builder';
import { sendEmail } from './lib/gmail';
import { saveSnapshot, getActiveSubscribers } from './lib/db';
import { generateBlogPost, saveBlogPost } from './lib/blog-generator';
import { parsePriorityKeywords, sortByPriority } from './lib/priority-ranking';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.json({ name: 'github-trending-mailer', status: 'ok' });
});

app.get('/trigger', async (c) => {
  const auth = c.req.header('Authorization');
  const expected = `Bearer ${c.env.TRIGGER_SECRET}`;
  if (auth !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Digest takes 2-4 min, longer than HTTP request limit — run in background.
  c.executionCtx.waitUntil(
    runDigest(c.env).then((result) => {
      console.log(`[trigger] Result: ${JSON.stringify(result)}`);
    }),
  );
  return c.json({ success: true, status: 'started' });
});

app.post('/send-confirm', async (c) => {
  const auth = c.req.header('Authorization');
  if (auth !== `Bearer ${c.env.CONFIRM_SECRET}`) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => null)) as { email?: string; confirmToken?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';
  const confirmToken = body?.confirmToken ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !confirmToken) return c.json({ error: 'Invalid payload' }, 400);
  const base = c.env.UNSUBSCRIBE_BASE_URL ?? 'https://trends.softween.com';
  const confirmUrl = `${base}/abonelik-onayla?token=${encodeURIComponent(confirmToken)}`;
  try {
    await sendEmail(c.env, {
      to: email,
      subject: 'Aboneligini onayla - GitHub Trending Digest',
      html: buildConfirmEmailHtml(confirmUrl),
    });
    return c.json({ success: true });
  } catch (err) {
    console.error(`[send-confirm] failed: ${err instanceof Error ? err.message : String(err)}`);
    return c.json({ error: 'Send failed' }, 502);
  }
});

export function deduplicateRepos(
  daily: TrendingRepo[],
  weekly: TrendingRepo[],
  monthly: TrendingRepo[],
): { daily: TrendingRepo[]; weekly: TrendingRepo[]; monthly: TrendingRepo[] } {
  const seen = new Set<string>();
  daily.forEach((r) => seen.add(r.fullName));
  const weeklyFiltered = weekly.filter((r) => !seen.has(r.fullName));
  weeklyFiltered.forEach((r) => seen.add(r.fullName));
  const monthlyFiltered = monthly.filter((r) => !seen.has(r.fullName));
  return { daily, weekly: weeklyFiltered, monthly: monthlyFiltered };
}

function enrichRepos(
  repos: TrendingRepo[],
  readmes: Map<string, string | null>,
  summaries: Map<string, RepoSummary>,
  metas: Map<string, RepoMeta | null>,
): EnrichedRepo[] {
  return repos.map((repo) => ({
    ...repo,
    readme: readmes.get(repo.fullName) ?? null,
    aiSummary: summaries.get(repo.fullName) ?? null,
    meta: metas.get(repo.fullName) ?? null,
  }));
}

async function runDigest(env: Env): Promise<{ success: boolean; repoCount: number; error?: string }> {
  const startTime = Date.now();

  try {
    // 1. Scrape all 3 trending pages in parallel
    console.log('[digest] Fetching trending pages...');
    const [dailyRaw, weeklyRaw, monthlyRaw] = await Promise.all([
      fetchTrendingRepos('daily'),
      fetchTrendingRepos('weekly'),
      fetchTrendingRepos('monthly'),
    ]);
    console.log(
      `[digest] Found: daily=${dailyRaw.length}, weekly=${weeklyRaw.length}, monthly=${monthlyRaw.length}`,
    );

    // 2. Deduplicate across time ranges
    const { daily, weekly, monthly } = deduplicateRepos(dailyRaw, weeklyRaw, monthlyRaw);
    const allUniqueRepos = [...daily, ...weekly, ...monthly];
    console.log(`[digest] Unique repos after dedup: ${allUniqueRepos.length}`);

    if (allUniqueRepos.length === 0) {
      return { success: true, repoCount: 0 };
    }

    // 3. Fetch READMEs and repo metadata in parallel
    console.log('[digest] Fetching READMEs and metadata...');
    const [readmes, metas] = await Promise.all([
      fetchReadmesBatch(allUniqueRepos, env.GITHUB_TOKEN, 10),
      fetchRepoMetaBatch(allUniqueRepos, env.GITHUB_TOKEN, 10),
    ]);

    // 4. Generate AI summaries in batches
    console.log('[digest] Generating AI summaries...');
    const reposWithReadmes = allUniqueRepos.map((repo) => ({
      repo,
      readme: readmes.get(repo.fullName) ?? null,
    }));
    const summaries = await summarizeReposBatch(env.AI, reposWithReadmes, 5);

    // 5. Build enriched digest (optional operator-defined priority via env)
    const priorityWeights = parsePriorityKeywords(env.PRIORITY_KEYWORDS);
    const digest: TrendingDigest = {
      daily: sortByPriority(enrichRepos(daily, readmes, summaries, metas), priorityWeights),
      weekly: sortByPriority(enrichRepos(weekly, readmes, summaries, metas), priorityWeights),
      monthly: sortByPriority(enrichRepos(monthly, readmes, summaries, metas), priorityWeights),
      generatedAt: new Date().toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Istanbul',
      }),
    };

    // 5.5 Save to D1 database
    const today = new Date().toISOString().split('T')[0];
    try {
      await saveSnapshot(env.DB, today, { daily: digest.daily, weekly: digest.weekly, monthly: digest.monthly });
    } catch (dbErr) {
      console.error(`[digest] D1 save failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
    }

    // 5.7 Generate daily blog post
    try {
      const blogPost = await generateBlogPost(env.AI, digest, today);
      await saveBlogPost(env.DB, blogPost, today, 'daily');
    } catch (blogErr) {
      console.error(`[digest] Blog generation failed: ${blogErr instanceof Error ? blogErr.message : String(blogErr)}`);
    }

    // 6. Build and send one email per period (Gmail clips >102KB)
    console.log('[digest] Building and sending emails per period...');
    const periods: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];
    const now = new Date();
    for (const period of periods) {
      if (digest[period].length === 0) {
        console.log(`[digest] Skipping ${period} (no repos)`);
        continue;
      }
      const html = buildEmailHtml(digest, period);
      const subject = buildEmailSubject(now, period);
      await sendEmail(env, {
        to: env.RECIPIENT_EMAIL,
        subject,
        html,
      });
    }

    // 7. Fan out the DAILY digest to opted-in subscribers (personalized unsubscribe)
    // Wrapped in its own try/catch: subscriber fan-out issues (including a transient
    // D1 error from getActiveSubscribers) must never flip the overall digest status
    // to failure, since the operator RECIPIENT_EMAIL digest above already sent.
    try {
      if (digest.daily.length > 0) {
        const subs = await getActiveSubscribers(env.DB);
        console.log(`[digest] Fanning out daily digest to ${subs.length} subscribers`);
        const subject = buildEmailSubject(now, 'daily');
        const unsubBase = env.UNSUBSCRIBE_BASE_URL ?? 'https://trends.softween.com';
        let ok = 0;
        let failed = 0;
        for (const sub of subs) {
          const unsubUrl = `${unsubBase}/abonelik-iptal?token=${sub.unsubscribe_token}`;
          try {
            await sendEmail(env, {
              to: sub.email,
              subject,
              html: buildEmailHtml(digest, 'daily', unsubUrl),
              headers: {
                'List-Unsubscribe': `<mailto:${env.GMAIL_SENDER_EMAIL}?subject=unsubscribe>, <${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            });
            ok++;
          } catch (err) {
            failed++;
            console.error(`[digest] Subscriber send failed for ${sub.email}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        console.log(`[digest] Subscriber fan-out done: ${ok} sent, ${failed} failed`);
      }
    } catch (fanOutErr) {
      console.error(`[digest] Subscriber fan-out failed: ${fanOutErr instanceof Error ? fanOutErr.message : String(fanOutErr)}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[digest] Done in ${elapsed}ms. Sent ${allUniqueRepos.length} repos.`);

    return { success: true, repoCount: allUniqueRepos.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[digest] Error: ${message}`);
    return { success: false, repoCount: 0, error: message };
  }
}

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runDigest(env).then((result) => {
        console.log(`[scheduled] Result: ${JSON.stringify(result)}`);
      }),
    );
  },
};
