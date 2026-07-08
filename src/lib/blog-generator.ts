import type { TrendingDigest } from '../types';

export async function generateBlogPost(
  ai: Ai,
  digest: TrendingDigest,
  date: string,
): Promise<{ title: string; slug: string; content: string; excerpt: string }> {
  // Pick top repos (highest period_stars from each period)
  const topRepos = [
    ...digest.daily.slice(0, 3),
    ...digest.weekly.slice(0, 3),
    ...digest.monthly.slice(0, 2),
  ];

  const repoSummaries = topRepos.map(r => {
    const s = r.aiSummary;
    return `- ${r.fullName} (${r.language}, ⭐${r.stars}): ${s?.summary ?? r.description}`;
  }).join('\n');

  const response = await ai.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [
      {
        role: 'system',
        content: `Sen bir teknoloji blog yazarısın. GitHub'da trend olan projeleri Türkçe olarak özetleyen blog yazıları yazıyorsun. Teknik terimler İngilizce kalabilir. HTML formatında yaz (h2, h3, p, ul, li, strong tagları kullan). Yazı en az 500 kelime olsun. Her projeyi ayrı bir bölümde ele al.`,
      },
      {
        role: 'user',
        content: `${date} tarihinde GitHub'da trend olan projelerin blog yazısını yaz. İşte bugün öne çıkan projeler:\n\n${repoSummaries}\n\nBaşlık formatı: "${date} GitHub Trending Özeti" şeklinde olmalı.`,
      },
    ],
    max_tokens: 2000,
    temperature: 0.6,
  });

  const content = ((response as { response?: string }).response ?? '').trim();
  const title = `${date} GitHub Trending Özeti: Bugün Öne Çıkan Projeler`;
  const slug = `${date}-github-trending-ozeti`;
  const excerpt = content.replace(/<[^>]*>/g, '').substring(0, 200) + '...';

  return { title, slug, content, excerpt };
}

export async function saveBlogPost(
  db: D1Database,
  post: { title: string; slug: string; content: string; excerpt: string },
  date: string,
  type: string = 'daily',
): Promise<void> {
  const id = `blog_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  // Replace existing post for this date/type
  await db.prepare('DELETE FROM blog_posts WHERE date = ? AND type = ?').bind(date, type).run();

  await db.prepare(
    'INSERT INTO blog_posts (id, slug, title, content, excerpt, date, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, post.slug, post.title, post.content, post.excerpt, date, type).run();

  console.log(`[blog] Saved blog post: ${post.slug}`);
}
