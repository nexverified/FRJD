# Transaction spine data model — Sprint 1

The current `enquiries` and `rate_limits` tables in `drizzle/0000_overjoyed_nextwave.sql` are preserved. A forward-only `0001` migration adds the following D1/SQLite tables. Timestamps are Unix milliseconds. IDs are opaque text; `FRJD-PR-` references are unique human-readable keys but never used as authorization. Money uses integer minor units for quoted amounts; verified RMB source costs use integer fen to avoid floating-point prices.

| Table | Key fields and constraints | Why |
|---|---|---|
| `customers` | `id` PK; name/company/email/WhatsApp; created_at | One customer contact snapshot per new request in Sprint 1; no claimed verified identity or login |
| `procurement_requests` | `id` PK/reference; `customer_id` FK; status; `version` integer; `current_quote_version` nullable; `access_token_hash`; `idempotency_key` UNIQUE; `payload_hash`; destination/postal/target price/requested service/QC/notes; created/updated_at | Request state, optimistic concurrency, private capability and safe retries |
| `procurement_request_items` | `id` PK; `request_id` FK; description, quantity, variant/specification, notes | Supports one submitted item now without making later multi-item quotes impossible |
| `product_sources` | `id` PK; `request_item_id` FK; normalized URL, platform enum, detection source `url_only`, created_at | Provenance of user-supplied link; not a claim of fetched metadata |
| `supplier_information` | `request_item_id` PK/FK; verified title, supplier name/URL, RMB price in fen, MOQ, domestic freight in fen, lead-time days, operator internal notes, verified_at | Human-recorded source facts; never auto-populated from listing |
| `quotes` | `id` PK; `request_id` FK; `(request_id,version)` UNIQUE; currency, total_minor, valid_until, operator/public notes, published_at | Immutable published quote snapshot. A revision inserts a new row; previous versions stay readable in audit/history |
| `quote_items` | `id` PK; `quote_id` FK; category, description, amount_minor, display_order | Explicit customer-facing breakdown; no pricing formula |
| `events` | `id` PK; `request_id` FK; type, actor_type, from/to status, quote_version, public_message, internal_message, created_at | Append-only transition/action history, with private notes excluded from customer response |
| `notifications` | `id` PK; `event_id` FK; request_id FK; type, recipient role, status `PENDING_MANUAL`, created_at | Durable zero-cost manual queue. A row is not evidence of email/WhatsApp delivery |

Foreign keys and status/category checks belong in the migration. The existing SQLite preview enables foreign keys. The first request submission creates customer, request, item, optional source, SUBMITTED event and new-request notification atomically. The first quote version is 1; later revisions increment with a uniqueness constraint. Quote rows/items are never updated after publish. Customer actions name the exact quote version. The request's `version` increments on transitions and quote publication; API mutation requires `expectedVersion` to avoid overwriting another actor's work.

Data handling: customer email/WhatsApp are contact information, not proof of identity. The access secret is returned once and only its digest is persisted. Internal supplier costs and operator notes are omitted from the customer response. Existing legacy `enquiries` are retained unchanged and shown read-only in the operator console, not silently converted or deleted. No cross-table link is fabricated between a legacy enquiry and a new procurement request.
