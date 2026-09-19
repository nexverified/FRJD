# FRJD — China sourcing and international logistics

This repository contains the FRJD public website and enquiry service. Sprint 1 source adds a persistent procurement request, operator review, versioned manual quotation and private customer response workflow. The current public deployment has not yet been updated with this sprint. The site does not invent product prices, freight rates, or tracking events: these workflows require human review.

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
| `FRJD_ADMIN_TOKEN` | Strong server-side bearer secret (at least 32 characters) for the Worker-only `/ops.html` console and `/api/operator/*`; also authorizes legacy `GET /api/admin/enquiries` |

The database schema is in `db/schema.ts` and the forward migrations in `drizzle/`. Sprint 1's migration is `drizzle/0001_quiet_risque.sql`. Hosting metadata is in `.openai/hosting.json`; it contains a project identifier and binding names, not runtime secrets.

## Current functionality

- In this checkout, `/quote.html` submits to `POST /api/procurement-requests`. It returns a durable `FRJD-PR-` reference, submission timestamp and a private link. `/request.html` uses that link to show status/quotes and record questions, approval or decline. `/contact.html` and `/tracking.html` still submit to `POST /api/submit-quote`.
- The Worker-only `/ops.html` console lists the latest 100 procurement requests, supports status filtering, human verification and operator-entered quote versions, and shows a manual notification queue. It also shows earlier enquiries read-only. It requires `FRJD_ADMIN_TOKEN` and is not included in the GitHub Pages build.
- The product link on the home page is carried into the quote form. `POST /api/resolve-product` explicitly reports manual intake; it does not parse 1688, Taobao, Alibaba, or other listings.
- `POST /api/quote/estimate` and `POST /api/track` explicitly report that automated quotes and live tracking are unavailable.
- The Worker serves the pages, sitemap, robots file, and an allowlist of assets. Legacy page names redirect to canonical pages.

Run `npm test` for route, validation, database, idempotency, rate-limit, and access checks. Passing local tests does not verify production contact routing or staff follow-up.

## Deployment

The primary showcase URL is <https://nexverified.github.io/FRJD/>. GitHub Actions builds and publishes the static pages on pushes to `main`. The quote, contact, and shipment-update forms call the existing Worker/D1 service at <https://frjd-sourcing.bhuvanraju66.chatgpt.site/>; GitHub Pages cannot run that backend itself. Both addresses are public. The Worker deployment is managed separately through the Sites project in `.openai/hosting.json`, so a GitHub push alone does not update that backend.

The public site is available for showcase and testing, but the Sprint 1 transaction workflow is currently local source only. Deploy the forward D1 migration and updated Worker before publishing the new GitHub Pages quote form, configure a strong operator credential and named queue owner, then run a hosted end-to-end test. A GitHub push alone cannot update the Worker. The new notification records are a **manual queue**, not sent messages. Verified customer contact details have not been supplied, so direct contact links remain blank. See `docs/sprint-1/SPRINT-1-RESULT.md` for the deployment state and limitations.

## Repository hygiene

`.gitignore` excludes dependencies, generated `dist/`, local databases, environment files, logs, caches, and local tool state. `.env.example` is intentionally tracked with blank contact/secret values. Avoid committing supplier data, customer enquiries, API documents, or experimental local files. The tracked release source, three selected images, migration, generated route files, and tests are the intended V1 commit.
