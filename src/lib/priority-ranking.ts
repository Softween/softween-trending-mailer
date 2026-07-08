import type { EnrichedRepo } from '../types';

/**
 * Parse an optional PRIORITY_KEYWORDS env value into regex/weight pairs.
 * Format: comma-separated "keyword:weight" (e.g. "salon:6, pricing:4").
 * Empty/undefined => [] => neutral ranking (pure period-stars order).
 * Keyword list is intentionally NOT hardcoded so this open-source tool
 * ships neutral; operators inject their own bias via the env var/secret.
 */
export function parsePriorityKeywords(raw: string | undefined): Array<[RegExp, number]> {
  if (!raw) return [];
  const pairs: Array<[RegExp, number]> = [];
  for (const part of raw.split(',')) {
    const [kw, wStr] = part.split(':').map((s) => s.trim());
    if (!kw) continue;
    const weight = Number(wStr);
    if (!Number.isFinite(weight) || weight === 0) continue;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pairs.push([new RegExp(`\\b${escaped}\\b`, 'i'), weight]);
  }
  return pairs;
}

export function computePriorityScore(
  repo: EnrichedRepo,
  weights: Array<[RegExp, number]>,
): number {
  if (weights.length === 0) return 0;
  const haystack = [
    repo.fullName,
    repo.description ?? '',
    repo.aiSummary?.summary ?? '',
    repo.aiSummary?.targetAudience ?? '',
    ...(repo.aiSummary?.highlights ?? []),
    repo.aiSummary?.usageExample ?? '',
  ].join(' ');
  let score = 0;
  for (const [pattern, weight] of weights) {
    if (pattern.test(haystack)) score += weight;
  }
  return score;
}

export function sortByPriority(
  repos: EnrichedRepo[],
  weights: Array<[RegExp, number]>,
): EnrichedRepo[] {
  return [...repos].sort((a, b) => {
    const scoreDiff = computePriorityScore(b, weights) - computePriorityScore(a, weights);
    if (scoreDiff !== 0) return scoreDiff;
    return b.periodStars - a.periodStars;
  });
}
