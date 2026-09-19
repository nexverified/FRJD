# Transaction spine architecture — Sprint 1

Baseline: `docs/current-state/CODEX-CURRENT-STATE.md` and the checked-in `release/*` Worker/Pages build at `ed31c7b`. The existing public marketing pages, contact/tracking enquiry endpoint, and `enquiries` table remain operational. This sprint adds one real procurement vertical beside them; it does not import untracked `api/*`, `js/*`, or the separate Enterprise simulator.

## Runtime boundaries

1. GitHub Pages serves the existing site, an expanded `/quote.html` procurement form, and `/request.html`, a customer request/quote page. `release/client.js` handles intake; `release/request.js` handles secure read and customer actions. The build rewrites `/FRJD/` paths and inserts the Worker origin.
2. The existing Sites Worker (`release/worker.mjs`) remains the API entrypoint. New `/api/procurement-requests` and `/api/operator/*` routes delegate to a small transaction module. D1 remains the authoritative store. No arbitrary outbound product URL fetches occur.
3. `/ops.html` and `release/ops.js` are served **only** by the Worker origin, not included in `createPages()` or the Pages artifact. The operator enters a strong server-configured secret; it stays in page memory and is sent in a bearer header over HTTPS. Each operator API call rechecks it. No simulated staff session or browser-local operational records.
4. Customers receive a `FRJD-PR-` reference and a cryptographically random 256-bit access secret generated before submission. Only its SHA-256 hash is stored. `/request.html#ref=...&access=...` keeps the secret in the URL fragment, which is not sent in HTTP requests/referrers; JS sends it as a bearer token to read and act on that request. The reference alone reveals nothing. The customer must save the private link until a verified delivery channel exists.
5. D1 `batch()` supplies atomic multi-statement request/event/notification and quote/item/event writes. Its transaction semantics are documented by [Cloudflare D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Local test adapter implements equivalent rollback. Every state change uses expected version/status checks and writes an event in the same batch.

## Routes and scope

| Route | Role |
|---|---|
| `POST /api/procurement-requests` | Anonymous, rate-limited create; returns reference/status/timestamp/access secret only after confirmed save |
| `GET /api/procurement-requests/:ref` | Customer bearer capability; returns own requirements, public events and current immutable quote |
| `POST /api/procurement-requests/:ref/actions` | Customer capability; approve, decline, ask question, or answer a needs-information request |
| `GET /api/operator/requests?status=` | Strong operator bearer; latest 100 requests and status filter (no pagination yet) |
| `GET /api/operator/requests/:ref` | Operator bearer; full intake, verification, events and quote history |
| `POST /api/operator/requests/:ref/review` | Operator bearer; start review, ask for details, or verify product/supplier fields |
| `POST /api/operator/requests/:ref/quotes` | Operator bearer; publish a structured quote version |
| `GET /api/operator/notifications` | Operator bearer; durable manual notification queue |
| `GET /api/operator/legacy-enquiries` | Operator bearer; read-only old `enquiries` so earlier leads are not dropped |
| `GET /ops.html`, `/release/ops.js` | Worker-only operator UI and logic |
| `/quote.html`, `/request.html`, existing marketing pages | Pages and Worker; no customer login |

The existing `POST /api/submit-quote` remains for contact/tracking and older clients. Existing `GET /api/admin/enquiries` remains for compatibility. New quote-form submissions use the procurement endpoint, not the old enquiry table. No silent data migration is performed: old rows remain read-only and visible in the operator legacy queue; conversions, if needed, require a future explicit, audited workflow.

## Truth and operations

Marketplace detection labels URLs from 1688, Taobao, Tmall, Alibaba, JD, Weidian, Pinduoduo, generic HTTPS/HTTP, or unknown. It is **detection only**. On submission the UI says: “Product link received. FRJD will verify the listing and current purchasing information before preparing your quote.” The operator records actual product and supplier information; no web scraper, Yami call, rate formula, payment, warehouse or shipping status is introduced. All commercial amounts are operator-entered. A durable notification row is `PENDING_MANUAL`, never represented as delivered. The operator console shows it; a human must contact customers outside the app until a verified provider is configured.

## Internationalization seam

New browser-module messages use keyed English objects; generated page copy and some control labels remain English literals. Persist stable status/category/QC codes and ISO currency values; destination country is still free text. This leaves a translation path but is not a complete i18n layer or Chinese UI.
