import type { TrendingRepo, TimeRange } from '../types';

const GITHUB_TRENDING_URL = 'https://github.com/trending';

function parseNumber(str: string): number {
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}

export function parseTrendingHtml(html: string, _timeRange: TimeRange): TrendingRepo[] {
  const repos: TrendingRepo[] = [];

  const articleRegex = /<article class="Box-row">([\s\S]*?)<\/article>/g;
  let match: RegExpExecArray | null;

  while ((match = articleRegex.exec(html)) !== null) {
    const article = match[1];

    // Extract owner/repo from h2 > a href
    const hrefMatch = article.match(/<h2[^>]*>[\s\S]*?href="\/([^"]+)"[\s\S]*?<\/h2>/);
    if (!hrefMatch) continue;

    const fullName = hrefMatch[1];
    const parts = fullName.split('/');
    if (parts.length < 2) continue;
    const owner = parts[0];
    const name = parts[1];

    // Extract description
    const descMatch = article.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract language
    const langMatch = article.match(/itemprop="programmingLanguage">(.*?)</);
    const language = langMatch ? langMatch[1].trim() : '';

    // Extract stars count
    const starsMatch = article.match(
      /href="[^"]*\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/
    );
    const stars = starsMatch ? parseNumber(starsMatch[1]) : 0;

    // Extract forks count
    const forksMatch = article.match(
      /href="[^"]*\/forks"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/
    );
    const forks = forksMatch ? parseNumber(forksMatch[1]) : 0;

    // Extract period stars ("10,158 stars today" / "14,531 stars this week")
    const periodMatch = article.match(/([\d,]+)\s+stars\s+(today|this week|this month)/);
    const periodStars = periodMatch ? parseNumber(periodMatch[1]) : 0;
    const periodLabel = periodMatch ? periodMatch[2] : '';

    repos.push({
      owner,
      name,
      fullName,
      description,
      language,
      stars,
      forks,
      periodStars,
      periodLabel,
      url: `https://github.com/${fullName}`,
    });
  }

  return repos;
}

export async function fetchTrendingRepos(timeRange: TimeRange): Promise<TrendingRepo[]> {
  const sinceParam = timeRange === 'daily' ? 'daily' : timeRange === 'weekly' ? 'weekly' : 'monthly';
  const url = `${GITHUB_TRENDING_URL}?since=${sinceParam}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'GitHub-Trending-Mailer/1.0',
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trending page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseTrendingHtml(html, timeRange);
}
