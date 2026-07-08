# GitHub Trending — Daily Mailer

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Automated daily GitHub Trending email digest. A Cloudflare Worker with a Cron Trigger that scrapes trending repos, summarizes them with Cloudflare Workers AI, and sends an HTML email via the Gmail REST API.

> See [`CLAUDE.md`](./CLAUDE.md) for the short architecture summary.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono v4
- **AI**: Cloudflare Workers AI (Qwen 3 — `@cf/qwen/qwen3-30b-a3b-fp8`)
- **Email**: Gmail REST API (service account with domain-wide delegation)
- **Testing**: Vitest

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Local dev with wrangler
npm run deploy       # Deploy to Cloudflare Workers
npm run typecheck    # TypeScript check
npm run test         # Run tests with Vitest
```

## Pipeline

Cron (04:00 UTC / 07:00 TR) → scrape GitHub Trending (3 pages) → fetch READMEs → AI summarize → build HTML email → send via Gmail.

## Secrets (via `wrangler secret put`)

| Secret                | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `GMAIL_CLIENT_EMAIL`  | Google service account email                |
| `GMAIL_PRIVATE_KEY`   | RSA private key                             |
| `GMAIL_SENDER_EMAIL`  | `alerts@yourdomain.com`                     |
| `RECIPIENT_EMAIL`     | Digest recipient (Dev group)                |
| `GITHUB_TOKEN`        | GitHub PAT (read-only, public repos)        |

## Cloudflare Bindings

| Binding | Type | Purpose                       |
| ------- | ---- | ----------------------------- |
| `AI`    | AI   | Workers AI repo summarization |

## Sibling Project

`softween-trending-web` renders the same data as a public Turkish web dashboard at its own domain, reading from the shared D1 database written by this Worker.

## Setup

1. `cp .dev.vars.example .dev.vars` ve değerleri doldur.
2. `npm install`
3. `npm run dev` (cron'u tetiklemek için `GET /trigger` + `Authorization: Bearer $TRIGGER_SECRET`).

## Optional ranking bias

`PRIORITY_KEYWORDS` env'i boşsa digest saf yıldız sırasıyla gider (tarafsız).
`salon:6, pricing:4` gibi `keyword:weight` listesi vererek operatör kendi önceliğini enjekte edebilir; liste koda gömülü değildir.
