import type { EnrichedRepo, TrendingDigest } from '../types';
import { stripThinkTags } from './ai-summarizer';

const AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

/** How many repos per period are fed to the model (keeps the prompt bounded). */
const PROMPT_REPOS_PER_PERIOD = 12;

export interface ExecutiveTheme {
  title: string;
  body: string;
}

export interface ExecutiveSummary {
  overview: string;
  themes: ExecutiveTheme[];
}

const SYSTEM_PROMPT = `Sen GitHub Trending verisini okuyup teknik bir yonetici ozeti yazan kidemli bir yazilim stratejistisin.
Teknik terimler (framework, API, runtime, model, agent vb.) Ingilizce kalir, geri kalan her sey Turkce.

Kurallar:
- "overview" 3-5 cumle: gunun one cikan reposu, haftalik ve aylik tablodaki en dikkat cekici gelismeler. Repo adlarini tam yaz (owner/name).
- "themes" 2-4 adet kesisen tema. Her temada "title" kisa bir baslik, "body" ise o temayi destekleyen gercek repo adlariyla 1-2 cumle.
- Yildiz sayilarini tekrar etme, ne ise yaradigini ve neden onemli oldugunu anlat.
- Sadece verilen repolardan konus, yeni proje uydurma.

Yalnizca gecerli JSON dondur, markdown yok, aciklama yok:
{"overview":"...","themes":[{"title":"...","body":"..."}]}`;

function repoLine(repo: EnrichedRepo): string {
  const lang = repo.language ?? 'belirtilmemis';
  const desc = repo.aiSummary?.summary ?? repo.description ?? '';
  return `- ${repo.fullName} (${lang}, +${repo.periodStars} ${repo.periodLabel}): ${desc.slice(0, 240)}`;
}

function periodBlock(label: string, repos: EnrichedRepo[]): string {
  if (repos.length === 0) return `${label}: veri yok`;
  return `${label}:\n${repos.slice(0, PROMPT_REPOS_PER_PERIOD).map(repoLine).join('\n')}`;
}

export function buildExecSummaryPrompt(digest: TrendingDigest): string {
  return `Asagidaki GitHub Trending verisinden yonetici ozeti cikar.

${periodBlock('GUNLUK', digest.daily)}

${periodBlock('HAFTALIK', digest.weekly)}

${periodBlock('AYLIK', digest.monthly)}`;
}

export function parseExecSummaryResponse(text: string): ExecutiveSummary | null {
  try {
    const cleaned = stripThinkTags(text);
    const matches = cleaned.match(/\{[\s\S]*\}/);
    if (!matches) return null;

    const parsed = JSON.parse(matches[0]) as Record<string, unknown>;
    if (typeof parsed.overview !== 'string' || parsed.overview.trim() === '') return null;

    const rawThemes = Array.isArray(parsed.themes) ? parsed.themes : [];
    const themes: ExecutiveTheme[] = [];
    for (const theme of rawThemes) {
      if (typeof theme !== 'object' || theme === null) continue;
      const { title, body } = theme as Record<string, unknown>;
      if (typeof title === 'string' && typeof body === 'string' && title.trim() !== '') {
        themes.push({ title, body });
      }
    }

    return { overview: parsed.overview, themes };
  } catch {
    return null;
  }
}

/**
 * Builds the digest-wide executive summary. Returns null when the model is
 * unreachable or returns unusable output — the caller still sends the digest,
 * just without the summary block, and logs the reason.
 */
export async function generateExecutiveSummary(
  ai: Ai,
  digest: TrendingDigest,
): Promise<ExecutiveSummary | null> {
  if (digest.daily.length === 0 && digest.weekly.length === 0 && digest.monthly.length === 0) {
    return null;
  }

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildExecSummaryPrompt(digest) },
      ],
      max_tokens: 900,
      temperature: 0.4,
    });

    const text = (response as { response?: string }).response ?? '';
    const parsed = parseExecSummaryResponse(text);
    if (!parsed) {
      console.log(`[exec-summary] Parse failed, raw response: ${text.substring(0, 200)}`);
    }
    return parsed;
  } catch (err) {
    console.error(
      `[exec-summary] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
