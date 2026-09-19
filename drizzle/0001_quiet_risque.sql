CREATE TABLE customers (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 company TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 whatsapp TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE procurement_requests (
 id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id),
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION','VERIFIED','QUOTED','CUSTOMER_APPROVED','CUSTOMER_DECLINED')),
 version INTEGER NOT NULL DEFAULT 1,
 current_quote_version INTEGER,
 access_token_hash TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE,
 payload_hash TEXT NOT NULL,
 destination_country TEXT NOT NULL,
 postal_code TEXT NOT NULL DEFAULT '',
 target_price TEXT NOT NULL DEFAULT '',
 requested_service TEXT NOT NULL DEFAULT '',
 qc_requirement TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 last_mutation_id TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX procurement_requests_status_created_idx ON procurement_requests(status,created_at);
--> statement-breakpoint
CREATE TABLE procurement_request_items (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES procurement_requests(id),
 description TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 variant_specification TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX procurement_request_items_request_idx ON procurement_request_items(request_id);
--> statement-breakpoint
CREATE TABLE product_sources (
 id TEXT PRIMARY KEY NOT NULL,
 request_item_id TEXT NOT NULL REFERENCES procurement_request_items(id),
 url TEXT NOT NULL,
 platform TEXT NOT NULL CHECK(platform IN ('1688','taobao','tmall','alibaba','jd','weidian','pinduoduo','generic','unknown')),
 detection_source TEXT NOT NULL DEFAULT 'url_only',
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE supplier_information (
 request_item_id TEXT PRIMARY KEY NOT NULL REFERENCES procurement_request_items(id),
 verified_title TEXT NOT NULL,
 supplier_name TEXT NOT NULL,
 supplier_url TEXT NOT NULL DEFAULT '',
 price_cny_fen INTEGER NOT NULL CHECK(price_cny_fen>0),
 moq INTEGER NOT NULL CHECK(moq>0),
 domestic_freight_cny_fen INTEGER NOT NULL CHECK(domestic_freight_cny_fen>=0),
 lead_time_days INTEGER NOT NULL CHECK(lead_time_days>=0),
 internal_notes TEXT NOT NULL DEFAULT '',
 verified_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE quotes (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES procurement_requests(id),
 version INTEGER NOT NULL CHECK(version>0),
 currency TEXT NOT NULL,
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 valid_until TEXT NOT NULL,
 operator_notes TEXT NOT NULL DEFAULT '',
 customer_notes TEXT NOT NULL DEFAULT '',
 published_at INTEGER NOT NULL,
 UNIQUE(request_id,version)
);
--> statement-breakpoint
CREATE TABLE quote_items (
 id TEXT PRIMARY KEY NOT NULL,
 quote_id TEXT NOT NULL REFERENCES quotes(id),
 category TEXT NOT NULL CHECK(category IN ('GOODS','CHINA_FREIGHT','SERVICE','QC','WAREHOUSE','INTERNATIONAL_FREIGHT','OTHER')),
 description TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
 display_order INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX quote_items_quote_idx ON quote_items(quote_id,display_order);
--> statement-breakpoint
CREATE TABLE events (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES procurement_requests(id),
 type TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('CUSTOMER','OPERATOR','SYSTEM')),
 from_status TEXT,
 to_status TEXT,
 quote_version INTEGER,
 public_message TEXT NOT NULL DEFAULT '',
 internal_message TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX events_request_created_idx ON events(request_id,created_at);
--> statement-breakpoint
CREATE TABLE notifications (
 id TEXT PRIMARY KEY NOT NULL,
 event_id TEXT NOT NULL REFERENCES events(id),
 request_id TEXT NOT NULL REFERENCES procurement_requests(id),
 type TEXT NOT NULL,
 recipient_role TEXT NOT NULL CHECK(recipient_role IN ('OPERATOR','CUSTOMER')),
 status TEXT NOT NULL DEFAULT 'PENDING_MANUAL' CHECK(status='PENDING_MANUAL'),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX notifications_created_idx ON notifications(created_at);
--> statement-breakpoint
CREATE TRIGGER quotes_no_update BEFORE UPDATE ON quotes BEGIN SELECT RAISE(ABORT,'published quotes are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER quotes_no_delete BEFORE DELETE ON quotes BEGIN SELECT RAISE(ABORT,'published quotes are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER quote_items_no_update BEFORE UPDATE ON quote_items BEGIN SELECT RAISE(ABORT,'published quote items are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER quote_items_no_delete BEFORE DELETE ON quote_items BEGIN SELECT RAISE(ABORT,'published quote items are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'audit events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'audit events are immutable'); END;
