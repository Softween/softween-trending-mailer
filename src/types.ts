export interface Env {
  AI: Ai;
  DB: D1Database;
  GMAIL_CLIENT_EMAIL: string;
  GMAIL_PRIVATE_KEY: string;
  GMAIL_SENDER_EMAIL: string;
  RECIPIENT_EMAIL: string;
  GITHUB_TOKEN: string;
  TRIGGER_SECRET: string;
  CONFIRM_SECRET: string;
  PRIORITY_KEYWORDS?: string;
  UNSUBSCRIBE_BASE_URL?: string;
}

export interface TrendingRepo {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  periodStars: number;
  periodLabel: string; // "today" | "this week" | "this month"
  url: string;
}

export interface RepoMeta {
  openIssues: number;
  license: string;
  lastPush: string;
  createdAt: string;
  topics: string[];
  homepage: string;
  watchers: number;
}

export interface RepoSummary {
  summary: string;
  targetAudience: string;
  highlights: string[];
  usageExample: string;
  category: string;
}

export interface EnrichedRepo extends TrendingRepo {
  readme: string | null;
  aiSummary: RepoSummary | null;
  meta: RepoMeta | null;
}

export type TimeRange = 'daily' | 'weekly' | 'monthly';

export interface TrendingDigest {
  daily: EnrichedRepo[];
  weekly: EnrichedRepo[];
  monthly: EnrichedRepo[];
  generatedAt: string;
}
