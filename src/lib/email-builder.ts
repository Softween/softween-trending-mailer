import type { EnrichedRepo, TrendingDigest } from '../types';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export type TrendPeriod = 'daily' | 'weekly' | 'monthly';

const PERIOD_BADGE: Record<TrendPeriod, { label: string; bg: string; color: string }> = {
  daily: { label: '📅 Gunluk Trend', bg: '#1a3a2a', color: '#3fb950' },
  weekly: { label: '📊 Haftalik Trend', bg: '#1a2a3a', color: '#58a6ff' },
  monthly: { label: '📈 Aylik Trend', bg: '#2a1a3a', color: '#bc8cff' },
};

const PERIOD_META: Record<TrendPeriod, { subject: string; title: string; emoji: string }> = {
  daily: { subject: 'Gunluk', title: 'Gunluk Trending', emoji: '📅' },
  weekly: { subject: 'Haftalik', title: 'Haftalik Trending', emoji: '📊' },
  monthly: { subject: 'Aylik', title: 'Aylik Trending', emoji: '📈' },
};

function buildRepoCard(repo: EnrichedRepo, rank: number, period: TrendPeriod): string {
  const badge = PERIOD_BADGE[period];
  const summary = repo.aiSummary;
  const highlightsHtml = summary?.highlights
    .map((h) => `<li style="margin:4px 0;color:#c9d1d9;line-height:1.4;">${escapeHtml(h)}</li>`)
    .join('')
    ?? '';

  return `
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #30363d;">
        <!-- Repo Header -->
        <div style="margin-bottom:10px;">
          <span style="display:inline-block;background:#30363d;color:#7d8590;font-size:11px;padding:2px 8px;border-radius:10px;margin-right:8px;">#${rank}</span>
          <a href="${repo.url}" style="color:#58a6ff;font-size:17px;font-weight:700;text-decoration:none;">${escapeHtml(repo.fullName)}</a>
          <span style="display:inline-block;background:${badge.bg};color:${badge.color};font-size:11px;padding:2px 10px;border-radius:10px;margin-left:8px;font-weight:600;">${badge.label}</span>
        </div>

        <!-- Meta Bar -->
        <div style="margin-bottom:12px;font-size:13px;color:#7d8590;">
          ${repo.language ? `<span style="display:inline-block;background:#1f2937;padding:2px 8px;border-radius:4px;margin-right:8px;">${escapeHtml(repo.language)}</span>` : ''}
          <span style="margin-right:10px;">⭐ ${formatNumber(repo.stars)}</span>
          <span style="margin-right:10px;">🍴 ${formatNumber(repo.forks)}</span>
          ${repo.periodStars > 0 ? `<span style="background:#3b2308;color:#f0883e;padding:2px 8px;border-radius:4px;font-weight:600;">🔥 +${formatNumber(repo.periodStars)} ${escapeHtml(repo.periodLabel)}</span>` : ''}
        </div>

        <!-- Original Description -->
        ${repo.description ? `
        <div style="margin-bottom:10px;color:#8b949e;font-size:13px;font-style:italic;border-left:3px solid #30363d;padding-left:12px;">
          ${escapeHtml(repo.description)}
        </div>
        ` : ''}

        <!-- AI Summary -->
        ${summary ? `
          <div style="margin-bottom:10px;color:#e6edf3;font-size:14px;line-height:1.6;">
            ${escapeHtml(summary.summary)}
          </div>
          <div style="margin-bottom:8px;color:#a5d6ff;font-size:13px;">
            🎯 <strong>Hedef Kitle:</strong> ${escapeHtml(summary.targetAudience)}
          </div>
          ${highlightsHtml ? `
          <div style="margin-top:8px;">
            <div style="color:#7d8590;font-size:12px;font-weight:600;margin-bottom:4px;">TEMEL OZELLIKLER</div>
            <ul style="margin:0 0 0 16px;padding:0;font-size:13px;list-style:disc;">${highlightsHtml}</ul>
          </div>
          ` : ''}
          ${summary.usageExample ? `
          <div style="margin-top:10px;background:#0d1117;border:1px solid #1f3a1f;border-radius:8px;padding:10px 14px;">
            <div style="color:#3fb950;font-size:11px;font-weight:600;margin-bottom:4px;">💡 KULLANIM ORNEGI</div>
            <div style="color:#c9d1d9;font-size:13px;line-height:1.5;">${escapeHtml(summary.usageExample)}</div>
          </div>
          ` : ''}
        ` : ''}

        <!-- GitHub Link -->
        <div style="margin-top:12px;">
          <a href="${repo.url}" style="display:inline-block;background:#21262d;color:#58a6ff;font-size:12px;padding:6px 14px;border-radius:6px;text-decoration:none;border:1px solid #30363d;">GitHub'da Gor →</a>
        </div>
      </td>
    </tr>`;
}

function buildSection(title: string, emoji: string, repos: EnrichedRepo[], period: TrendPeriod): string {
  if (repos.length === 0) return '';

  const repoCards = repos.map((repo, i) => buildRepoCard(repo, i + 1, period)).join('');

  return `
    <tr>
      <td style="padding:24px 20px 12px;">
        <h2 style="margin:0;color:#e6edf3;font-size:20px;font-weight:600;">
          ${emoji} ${title} <span style="color:#7d8590;font-weight:400;font-size:14px;">(${repos.length} repo)</span>
        </h2>
      </td>
    </tr>
    ${repoCards}`;
}

export function buildEmailSubject(date: Date, period: TrendPeriod): string {
  const formatted = date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const label = PERIOD_META[period].subject;
  return `🔥 GitHub Trending Digest (${label}) — ${formatted}`;
}

export function buildConfirmEmailHtml(confirmUrl: string): string {
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d1117;"><tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#161b22;border-radius:12px;border:1px solid #30363d;">
      <tr><td style="padding:32px;text-align:center;">
        <h1 style="margin:0 0 12px;color:#e6edf3;font-size:20px;">Aboneligini onayla</h1>
        <p style="margin:0 0 24px;color:#7d8590;font-size:14px;">GitHub Trending gunluk Turkce digest'e abone olmak icin asagidaki baglantiya tikla. Bu istegi sen yapmadiysan bu e-postayi gormezden gelebilirsin.</p>
        <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 28px;background-color:#238636;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Aboneligi Onayla</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function buildEmailHtml(
  digest: TrendingDigest,
  period: TrendPeriod,
  unsubscribeUrl?: string,
): string {
  const repos = digest[period];
  const meta = PERIOD_META[period];
  const section = buildSection(meta.title, meta.emoji, repos, period);

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d1117;">
    <tr>
      <td align="center" style="padding:20px;">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background-color:#161b22;border-radius:12px;border:1px solid #30363d;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 20px 16px;text-align:center;border-bottom:1px solid #30363d;">
              <h1 style="margin:0 0 8px;color:#e6edf3;font-size:24px;">🔥 GitHub Trending Digest</h1>
              <p style="margin:0;color:#7d8590;font-size:14px;">${digest.generatedAt} · ${meta.title} · ${repos.length} repo</p>
            </td>
          </tr>

          ${section}

          <!-- Footer -->
          <tr>
            <td style="padding:20px;text-align:center;border-top:1px solid #30363d;">
              <p style="margin:0;color:#484f58;font-size:12px;">
                Cloudflare Workers AI ile olusturuldu · <a href="https://github.com/trending" style="color:#58a6ff;text-decoration:none;">github.com/trending</a>
              </p>
              ${unsubscribeUrl ? `<p style="margin:8px 0 0;color:#484f58;font-size:11px;">Bu bulteni trends.softween.com uzerinden istediniz. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7d8590;text-decoration:underline;">Abonelikten cik</a>.</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
