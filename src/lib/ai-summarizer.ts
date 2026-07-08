import type { TrendingRepo, RepoSummary } from '../types';

const AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `You are an expert software engineer who analyzes GitHub repos and writes Turkish summaries.
Technical terms (framework, API, library, runtime, model etc.) should stay in English.

Rules:
- Explain WHAT the repo does, HOW it works, and WHY it matters
- Give technical detail, not surface-level descriptions
- "summary" must be at least 3 sentences in Turkish
- "targetAudience" must be specific (not just "Python developers")
- "highlights" must be real technical features (not star counts)
- "usageExample" must be a concrete, real-world scenario showing WHERE and HOW someone would use this project. Be specific — mention a job role, a task, and the benefit. Write 2-3 sentences in Turkish.
- "category" must be exactly ONE of: "AI/ML", "Web Dev", "DevOps", "Mobile", "Data", "Security", "CLI Tool", "Finance", "Game", "Education", "Other"

Respond with ONLY valid JSON, no markdown, no explanation:
{"summary":"3-4 sentence detailed Turkish summary","targetAudience":"specific target audience in Turkish","highlights":["technical feature 1","technical feature 2","technical feature 3"],"usageExample":"2-3 sentence concrete usage scenario in Turkish","category":"exactly one category from the list"}`;

export function buildUserPrompt(repo: TrendingRepo, readme: string | null): string {
  const readmeSection = readme
    ? `\n\nREADME icerigi:\n${readme}`
    : '';

  return `Bu GitHub reposunu detayli analiz et:

Repo: ${repo.fullName}
Aciklama: ${repo.description || 'Aciklama yok'}
Programlama Dili: ${repo.language || 'Belirtilmemis'}
Toplam Yildiz: ${repo.stars.toLocaleString()}
Trend: ${repo.periodStars.toLocaleString()} yeni yildiz (${repo.periodLabel})
${readmeSection}`;
}

export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export function parseSummaryResponse(text: string): RepoSummary | null {
  try {
    const cleaned = stripThinkTags(text);
    // Find JSON object — use last match to skip any preamble
    const matches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (!matches || matches.length === 0) return null;

    const parsed = JSON.parse(matches[matches.length - 1]) as Record<string, unknown>;
    if (
      typeof parsed.summary !== 'string' ||
      typeof parsed.targetAudience !== 'string' ||
      !Array.isArray(parsed.highlights) ||
      !parsed.highlights.every((h: unknown) => typeof h === 'string')
    ) {
      return null;
    }
    // usageExample is optional from AI — provide empty string if missing
    if (typeof parsed.usageExample !== 'string') {
      parsed.usageExample = '';
    }
    if (typeof parsed.category !== 'string') {
      parsed.category = '';
    }
    return parsed as unknown as RepoSummary;
  } catch {
    return null;
  }
}

export function fallbackSummary(repo: TrendingRepo): RepoSummary {
  const desc = repo.description || `${repo.fullName} acik kaynakli bir ${repo.language} projesi.`;
  return {
    summary: `${desc} Proje ${repo.stars.toLocaleString()} yildiza ulasarak buyuk ilgi gormus ve ${repo.periodLabel} icinde ${repo.periodStars.toLocaleString()} yeni yildiz almis.`,
    targetAudience: `${repo.language} ekosisteminde calisan gelistiriciler ve bu alanda cozum arayanlar`,
    highlights: [
      repo.description || `${repo.language} ile gelistirilmis acik kaynak proje`,
      `${repo.stars.toLocaleString()} yildiz ile populer`,
      `${repo.periodLabel} icinde ${repo.periodStars.toLocaleString()} yeni yildiz`,
    ],
    usageExample: '',
    category: '',
  };
}

export async function summarizeRepo(
  ai: Ai,
  repo: TrendingRepo,
  readme: string | null,
): Promise<RepoSummary> {
  try {
    const response = await ai.run(AI_MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(repo, readme) },
      ],
      max_tokens: 700,
      temperature: 0.4,
    });

    const text = (response as { response?: string }).response ?? '';
    const parsed = parseSummaryResponse(text);
    if (!parsed) {
      console.log(`[ai] Parse failed for ${repo.fullName}, raw response: ${text.substring(0, 200)}`);
    }
    return parsed ?? fallbackSummary(repo);
  } catch (err) {
    console.error(`[ai] Error for ${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    return fallbackSummary(repo);
  }
}

export async function summarizeReposBatch(
  ai: Ai,
  repos: Array<{ repo: TrendingRepo; readme: string | null }>,
  concurrency: number = 5,
): Promise<Map<string, RepoSummary>> {
  const results = new Map<string, RepoSummary>();

  for (let i = 0; i < repos.length; i += concurrency) {
    const batch = repos.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ repo, readme }) => {
        const summary = await summarizeRepo(ai, repo, readme);
        return { fullName: repo.fullName, summary };
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.fullName, result.value.summary);
      }
    }
  }

  return results;
}
