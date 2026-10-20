import type { TrendingDigest } from '../types';
import { stripThinkTags } from './ai-summarizer';

const AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

export interface PortfolioProject {
  id: string;
  label: string;
  /** One line: what it is, the stack, and what it currently needs. */
  description: string;
}

/** Editable list of Bilal's projects. The model may only pick ids from here. */
export const PORTFOLIO: readonly PortfolioProject[] = [
  { id: 'glossgo-be', label: 'glossgo-be', description: 'beauty marketplace backend (TR+US), Cloudflare Workers + Hono + Supabase; needs API performance, queues, auth, observability' },
  { id: 'glossgo-fe', label: 'glossgo-fe', description: 'Next.js on Cloudflare: customer, partner, admin apps and salon vanity sites; needs UI components, i18n, performance, e2e testing' },
  { id: 'glossgo-mobile', label: 'glossgo-mobile', description: 'Expo / React Native customer and partner apps; needs native UX, push, store release automation' },
  { id: 'glossgo-whatsapp', label: 'glossgo-whatsapp', description: 'WhatsApp booking assistant; needs conversational agents, LLM tool use, message flows' },
  { id: 'glossgo-studio', label: 'glossgo-studio', description: 'brand videos and image generation with Remotion/hyperframes; needs video, image and motion generation tooling' },
  { id: 'glossgo-crawler', label: 'glossgo-crawler', description: 'Apify + Playwright salon data collection; needs scraping, anti-bot, browser automation, data extraction' },
  { id: 'getfund', label: 'getfund', description: 'getfund.space: startup funding program discovery plus an agent autopilot that fills applications; needs browser agents, form filling, LLM agents, document parsing' },
  { id: 'softween-exam-world', label: 'softween-exam-world', description: 'Turkish exam prep site built with Astro; needs content tooling, quiz UX, SEO' },
  { id: 'softween-storyloom', label: 'softween-storyloom', description: 'story app, web and mobile; needs text/voice generation, reader UX' },
  { id: 'softween-trending', label: 'softween-trending', description: 'this digest plus trends.softween.com; needs scraping, summarization, email delivery' },
  { id: 'softween-hub', label: 'softween-hub', description: 'internal dashboard on Cloudflare with D1; needs dashboards, admin UI, data viz' },
  { id: 'autoder', label: 'autoder', description: 'automotive platform: API, crawler, frontend; needs listing data pipelines, search, pricing' },
  { id: 'fumbahome', label: 'fumbahome', description: 'real-estate website; needs listings UX, maps, SEO' },
  { id: 'dev-tooling', label: 'dev-tooling', description: "Bilal's Claude Code setup: skills, agents, token cost reduction, security auditing; needs agent tooling, context/cost reduction, secret scanning, code review automation" },
];

/** Domains whose mailboxes may see internal project names and needs. */
export const INTERNAL_DOMAINS = ['glossgo.com', 'softween.com', 'getfund.space'] as const;

/** True only when every address in the (possibly comma-separated) field is internal. */
export function isInternalRecipient(to: string): boolean {
  const addrs = to.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (addrs.length === 0) return false;
  return addrs.every((a) => {
    const m = a.match(/^[^\s@<>,]+@([^\s@<>,]+)$/);
    return !!m && (INTERNAL_DOMAINS as readonly string[]).includes(m[1]);
  });
}

export interface PortfolioMatch {
  repo: string;
  projectId: string;
  projectLabel: string;
  use: string;
  url: string;
}

export const MAX_MATCHES = 5;
export const MAX_USE_CHARS = 200;
const AI_TIMEOUT_MS = 30_000;
const MAX_CANDIDATES = 45;

const BLOCKED = /jail-?break|nsfw|porn|hentai|uncensor|erotic|\bxxx\b|\bgoon/i;

/** True when the repo name or description signals jailbreak/NSFW content. */
export function isBlockedRepo(fullName: string, description: string): boolean {
  return BLOCKED.test(`${fullName} ${description}`);
}

interface Candidate {
  fullName: string;
  description: string;
  url: string;
}

export function collectCandidates(digest: TrendingDigest): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const repo of [...digest.daily, ...digest.weekly, ...digest.monthly]) {
    if (seen.has(repo.fullName)) continue;
    seen.add(repo.fullName);
    const description = repo.description || repo.aiSummary?.summary || '';
    if (isBlockedRepo(repo.fullName, description)) continue;
    out.push({ fullName: repo.fullName, description: description.slice(0, 160), url: repo.url });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

const SYSTEM_PROMPT = `Sen bir yazilim portfoyu icin teknik danismansin. Sana proje listesi ve bugunku GitHub Trending repo listesi verilecek.
Gorev: Listedeki repolardan, projelerden birine SOMUT ve dogrudan faydasi olanlari sec (en fazla 5). Belirsiz, genel veya zorlama eslesme yazma; uygun repo yoksa bos liste dondur.
Kurallar:
- "repo" listedeki owner/name ile birebir ayni olmali.
- "project" proje listesindeki id olmali.
- "use" tek bir Turkce cumle (en fazla 200 karakter): repo o projede tam olarak ne ise yarar. Teknik terimler Ingilizce kalabilir.
Yalnizca gecerli JSON dizisi dondur, markdown yok, aciklama yok:
[{"repo":"owner/name","project":"id","use":"..."}]`;

export function buildPortfolioPrompt(candidates: Candidate[]): string {
  const projects = PORTFOLIO.map((p) => `- ${p.id}: ${p.description}`).join('\n');
  const repos = candidates.map((c) => `- ${c.fullName}: ${c.description}`).join('\n');
  return `PROJELER:\n${projects}\n\nBUGUNUN REPOLARI:\n${repos}`;
}

/** Parses and validates the model output; invalid items are dropped, result capped. */
export function parsePortfolioResponse(text: string, candidates: Candidate[]): PortfolioMatch[] | null {
  try {
    const cleaned = stripThinkTags(text);
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const parsed: unknown = JSON.parse(m[0]);
    if (!Array.isArray(parsed)) return null;

    const byName = new Map(candidates.map((c) => [c.fullName.toLowerCase(), c]));
    const projects = new Map(PORTFOLIO.map((p) => [p.id, p]));
    const usedRepos = new Set<string>();
    const out: PortfolioMatch[] = [];

    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const { repo, project, use } = item as Record<string, unknown>;
      if (typeof repo !== 'string' || typeof project !== 'string' || typeof use !== 'string') continue;
      const cand = byName.get(repo.trim().toLowerCase());
      const proj = projects.get(project.trim());
      const useText = use.trim();
      if (!cand || !proj || useText === '' || useText.length > MAX_USE_CHARS) continue;
      if (usedRepos.has(cand.fullName)) continue;
      usedRepos.add(cand.fullName);
      out.push({ repo: cand.fullName, projectId: proj.id, projectLabel: proj.label, use: useText, url: cand.url });
      if (out.length >= MAX_MATCHES) break;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Picks up to 5 trending repos concretely useful to a portfolio project.
 * Returns null on any failure, timeout or empty result so the digest still
 * ships without the section (same contract as generateExecutiveSummary).
 */
export async function generatePortfolioMatches(
  ai: Ai,
  digest: TrendingDigest,
): Promise<PortfolioMatch[] | null> {
  const candidates = collectCandidates(digest);
  if (candidates.length === 0) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = ai.run(AI_MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPortfolioPrompt(candidates) },
      ],
      max_tokens: 900,
      temperature: 0.2,
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), AI_TIMEOUT_MS);
    });
    const response = await Promise.race([call, timeout]);
    const text = (response as { response?: string }).response ?? '';
    const parsed = parsePortfolioResponse(text, candidates);
    if (!parsed || parsed.length === 0) {
      console.log(`[portfolio] No usable matches, raw response: ${text.substring(0, 200)}`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error(`[portfolio] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
