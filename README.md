# FRJD — China sourcing and international logistics

This repository contains the current FRJD public website and enquiry service. Buyers can submit a product link or description, request a written quotation, contact the team, or ask for a shipment update. The site does not invent product prices, freight rates, or tracking events: these workflows require human review.

The application is a small JavaScript site with a Cloudflare-compatible Worker and a D1 database. The source of truth is `release/`; root `.html` pages are generated from that source. The separate FRJD Enterprise portal/ERP prototype and earlier marketing experiments are not part of this release.

## Run locally

Use a recent Node.js version with built-in `node:sqlite` support (Node 22.5 or newer). Then:

```bash
npm ci
npm run build
npm test
npm run dev
```

The local preview listens on `http://localhost:4173` by default. Set `PORT` to choose another port. `npm run dev` uses `server.js`, which starts `release/preview.mjs`; the preview uses a local SQLite database. Do not serve the generated HTML with a plain static file server if you need forms to work.

## Configuration

See `.env.example` for the supported names. Keep real values in your host's secret/environment settings, not in Git.

| Variable/binding | Purpose |
|---|---|
| `DB` | D1 database binding required for enquiry persistence |
| `FRJD_SITE_ORIGIN` | Canonical origin for metadata and sitemap |
| `FRJD_CONTACT_EMAIL` | Verified customer contact email; blank hides the direct link |
| `FRJD_WHATSAPP_NUMBER` | Verified WhatsApp number; blank hides the direct link |
| `FRJD_ADMIN_TOKEN` | Optional server-side bearer secret for `GET /api/admin/enquiries` |

The database schema is in `db/schema.ts` and `drizzle/0000_overjoyed_nextwave.sql`. Hosting metadata is in `.openai/hosting.json`; it contains a project identifier and binding names, not runtime secrets.

## Current functionality

- `/quote.html`, `/contact.html`, and `/tracking.html` submit to `POST /api/submit-quote`. A successful response confirms the saved request and returns a reference.
- The product link on the home page is carried into the quote form. `POST /api/resolve-product` explicitly reports manual intake; it does not parse 1688, Taobao, Alibaba, or other listings.
- `POST /api/quote/estimate` and `POST /api/track` explicitly report that automated quotes and live tracking are unavailable.
- The Worker serves the pages, sitemap, robots file, and an allowlist of assets. Legacy page names redirect to canonical pages.

Run `npm test` for route, validation, database, idempotency, rate-limit, and access checks. Passing local tests does not verify production contact routing or staff follow-up.

## Deployment

The application is currently hosted through the existing Sites project described in `.openai/hosting.json`. The review URL is <https://frjd-sourcing.bhuvanraju66.chatgpt.site>. Hosting access is currently limited to the site owner. Pushing to GitHub does **not** change that access policy or deploy to Netlify automatically.

The full application requires the Worker runtime and D1 binding. A basic static Netlify deploy would render pages but would not save enquiries. Before public customer use, configure verified contact details, establish staff review/notification, test a hosted enquiry end to end, and deliberately change hosting access.

## Repository hygiene

`.gitignore` excludes dependencies, generated `dist/`, local databases, environment files, logs, caches, and local tool state. `.env.example` is intentionally tracked with blank contact/secret values. Avoid committing supplier data, customer enquiries, API documents, or experimental local files. The tracked release source, three selected images, migration, generated route files, and tests are the intended V1 commit.
