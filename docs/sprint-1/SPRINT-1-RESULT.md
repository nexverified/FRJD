# FRJD transaction spine — Sprint 1 result

Date: 19 September 2026. Baseline: `ed31c7b` on `main`, described in `docs/current-state/CODEX-CURRENT-STATE.md`. This document describes the Sprint 1 source and local verification. **The new transaction workflow is not deployed to the public GitHub Pages or Sites Worker at the time of this report.** The existing public enquiry site remains the live version.

## Implemented and classified

| Capability | Status in this checkout | Evidence |
|---|---|---|
| Product link/description intake, 1688/Taobao/Tmall/Alibaba/JD/Weidian/Pinduoduo/generic hostname detection, manual fallback | WORKING locally | `release/client.js`, `release/transaction.mjs` `normalizeProductUrl`/`validateProcurement`, `tests/transaction.test.mjs` |
| Persistent request, customer, item, source, state, event and manual notification creation | WORKING locally | `release/transaction.mjs` `createRequest`, `drizzle/0001_quiet_risque.sql`, local HTTP demonstration below |
| Private customer request/quote view and question/approval/decline/answer actions | WORKING locally at API level; PARTIAL browser coverage | `release/request.js`, `customerView`/`customerAction`, transaction tests and HTTP demonstration |
| Operator list/filter/detail, verification, information request, quote publication and legacy enquiry readback | WORKING locally at API level; PARTIAL browser coverage | `release/ops.js`, `/ops.html` in `release/worker.mjs`, `operatorList`/`operatorReview`/`operatorQuote`, transaction tests |
| Immutable published quote versions, line-item totals and audit events | WORKING locally | `quotes`, `quote_items`, `events` and immutable triggers in migration; revision/immutability tests |
| Durable notification queue | WORKING locally as `PENDING_MANUAL`; delivery PLANNED | `notifications` table, `GET /api/operator/notifications`; no mail/WhatsApp sender |
| Automatic listing retrieval, pricing formula, Yami, payment, order, warehouse and shipping integrations | PLANNED/out of this sprint | No calls or routes added in `release/transaction.mjs` |
| Public production transaction flow | PLANNED for coordinated rollout | New D1 migration and Worker have not been applied to the live host; GitHub Pages `main` workflow would publish the new form independently |

The existing `enquiries` table and `/api/submit-quote` remain for contact/tracking and older clients. The new quote form uses `/api/procurement-requests`; old rows are shown read-only in `/api/operator/legacy-enquiries` and are not converted. No enquiry was deleted or silently reclassified.

## Architecture and database

GitHub Pages serves generated static content from `release/pages.mjs`, `release/client.js` and `release/request.js` through `release/build-pages.mjs`. The Worker entrypoint `release/worker.mjs` delegates new APIs to `release/transaction.mjs`; D1 `DB` is the record store. `/ops.html` and `release/ops.js` are Worker-only and absent from `pages-dist`. A 256-bit browser-generated capability token grants access to exactly one customer request; only its SHA-256 digest is stored. The human-readable reference alone does not grant access. Operators use `FRJD_ADMIN_TOKEN` on the Worker origin. The token is a shared initial operator credential, not named staff accounts or MFA.

Migration `drizzle/0001_quiet_risque.sql` adds `customers`, `procurement_requests`, `procurement_request_items`, `product_sources`, `supplier_information`, `quotes`, `quote_items`, `events` and `notifications`, with foreign keys, status/category constraints, quote-version uniqueness and immutable quote/event triggers. `db/schema.ts` mirrors the tables; migration SQL adds the checks/triggers not expressed in Drizzle. `release/preview.mjs` enables foreign keys and implements a transactional SQLite `batch()` adapter for local work. Each successful request/mutation writes its state and event/notification in one D1 batch. Quote totals only sum operator-entered minor-unit line items; no invented FRJD rates or margins are calculated.

Routes/screens: `/quote.html` collects specification, QC and contact details; `/request.html` shows a private customer record and quote; Worker `/ops.html` provides the operator queue. APIs are `POST /api/procurement-requests`, `GET /api/procurement-requests/:ref`, `POST /api/procurement-requests/:ref/actions`, `GET /api/operator/requests`, `GET /api/operator/requests/:ref`, `POST /api/operator/requests/:ref/review`, `POST /api/operator/requests/:ref/quotes`, `GET /api/operator/notifications`, and `GET /api/operator/legacy-enquiries`. Pages/Worker robots and sitemap exclude the private request and operator pages; the request page has noindex and no-referrer metadata. `docs/sprint-1/TRANSACTION-SPINE-ARCHITECTURE.md`, `DATA-MODEL.md`, `STATE-MACHINE.md` and `SECURITY-MODEL.md` describe contracts and boundaries.

## Test transaction — local fixture only

On 19 September 2026 a local HTTP client used `release/preview.mjs` and the file-backed `.local/enquiries.sqlite`. All names, supplier facts and prices in this run were explicitly **TEST ONLY**, not FRJD commercial data. No live customer was contacted or charged.

1. Submitted `https://detail.1688.com/offer/123456789012.html` for 500 test canvas tote bags, UK destination, QC requirement and test-only contact. The server returned **`FRJD-PR-457C2291B232`**, `SUBMITTED`, at `2026-09-19T06:57:50.735Z`.
2. An authenticated operator list included that reference. The operator moved it to `UNDER_REVIEW`, then recorded a test product title, test supplier, RMB price, MOQ, domestic freight, lead time and internal note. State became `VERIFIED`.
3. The operator published quote version 1 in CNY with goods, China freight, service and QC line items totaling **CNY 6,205.00**. The customer capability could read that quote and its breakdown, without internal supplier cost or operator notes.
4. The customer approved **version 1**. The final state was `CUSTOMER_APPROVED`. Public history contained `REQUEST_SUBMITTED`, `REVIEW_STARTED`, `PRODUCT_VERIFIED`, `QUOTE_PUBLISHED`, `CUSTOMER_APPROVED`. The manual queue contained `NEW_REQUEST`, `QUOTE_READY` and `CUSTOMER_APPROVED`; none was marked sent.
5. After stopping and restarting the local server, an operator readback still returned the same reference, approved state, five events, one quote and one supplier verification row. This confirms local disk persistence across process restart. It does **not** prove hosted D1 migration or live notification delivery.

## Validation and security

`npm test` passed **15/15** tests (nine existing, six new) after the final code changes. The tests cover creation, validation/idempotency, marketplace host boundaries and unsafe URLs, customer/operator separation and cross-request denial, review transitions, supplier verification, quote publication/revision, immutability triggers, exact-version question/approval/decline, 20/hour anonymous rate limit, CORS/preflight and database batch rollback. `npm run build:pages` succeeded. The built Pages artifact includes `/request.html` and `request.js`, excludes `ops.html` and `ops.js`, and emits a robots rule for the private page. A local browser rendered the expanded quote form and Worker operator credential screen; the end-to-end mutation demonstration was done through HTTP, not a browser automation suite.

Untrusted URLs are normalized and classified by parsed hostname only; they are **never fetched**. Inputs have size/type/length checks, bound SQL parameters and output uses `textContent` for customer/operator data. Customer actions require the private bearer token, current request version and current quote version; approval also checks quote validity. Operator routes require a server-provisioned credential of at least 32 characters. The credential is held in the operator page's memory and is checked per API call. A private link remains a bearer secret: anyone who obtains the whole fragment can act on that request. There is no rotation, recovery, MFA, named operator attribution or separate mutation throttle yet. Pages hosting cannot apply the Worker's CSP headers; its customer page uses local scripts plus no-referrer/noindex metadata.

## Manual operation and rollout boundary

For local operation, set `FRJD_ADMIN_TOKEN` to a strong secret, run `npm run dev`, open the Worker-origin `/ops.html`, review the new request and manual-notification queue, verify source facts outside the application, and enter only an FRJD-approved commercial quote. A human must deliver information requests and quote-ready messages using a verified channel; `PENDING_MANUAL` proves only queueing. The customer must retain the private link after submission because no email/WhatsApp link delivery exists. Approval is a recorded decision for follow-up, **not** an order, payment or purchasing trigger.

For production, apply `drizzle/0001_quiet_risque.sql` to the bound D1 database, deploy the matching Worker bundle/assets, configure a strong `FRJD_ADMIN_TOKEN` and an accountable operator, then publish the GitHub Pages build and run a hosted end-to-end test on both origins. `main` pushes trigger `.github/workflows/pages.yml` and update Pages only; `.openai/hosting.json` identifies a separate Sites/Worker project. Publishing Pages before the migration/Worker would make the new quote form call an unavailable endpoint. No production migration or Worker deployment has been performed in this sprint. `FRJD_CONTACT_EMAIL` and `FRJD_WHATSAPP_NUMBER` remain blank pending owner-verified values; no unverified contact was introduced.

## Known limitations and next sprint

P0: Provision and verify production D1 migration/Worker/operator credential in deployment order; assign the human queue owner; provide verified customer contact and approved commercial terms; run a real hosted acceptance test before enabling the new public form. P1: Add named operator identity/MFA, credential rotation, notification provider with delivery receipts, private-link recovery/rotation, retention/deletion process, backups and monitoring. P2: Add pagination, browser E2E/accessibility checks, a proper English/Chinese message catalog and country-code normalization. P3: Evaluate marketplace enrichment, Yami rates, order/payment/warehouse/shipping only against verified provider access and FRJD operating rules.
