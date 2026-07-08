# CLAUDE.md

## Project Overview

Automated daily GitHub Trending email digest. Cloudflare Worker with Cron Trigger sends a daily email with AI-powered summaries of all trending repos (daily/weekly/monthly).

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Local dev with wrangler
npm run deploy       # Deploy to Cloudflare Workers
npm run typecheck    # TypeScript check
npm run test         # Run tests with Vitest
```

## Tech Stack

- Runtime: Cloudflare Workers
- Framework: Hono v4
- AI: Cloudflare Workers AI (Llama 4 Scout - @cf/meta/llama-4-scout-17b-16e-instruct)
- Email: Gmail REST API (service account, domain-wide delegation)
- Testing: Vitest

## Architecture

Cron (04:00 UTC / 07:00 TR) -> Scrape GitHub Trending (3 pages) -> Fetch READMEs -> AI Summarize -> Build HTML Email -> Send via Gmail

## Secrets (via wrangler secret put)

GMAIL_CLIENT_EMAIL  - Google service account email
GMAIL_PRIVATE_KEY   - RSA private key
GMAIL_SENDER_EMAIL  - alerts@yourdomain.com
RECIPIENT_EMAIL     - you@example.com (digest recipient)
GITHUB_TOKEN        - GitHub PAT (read-only, public repos)

## Cloudflare Bindings

AI - Workers AI - Repo summaries

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
