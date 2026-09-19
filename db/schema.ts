import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const enquiries = sqliteTable('enquiries', {
  id:text('id').primaryKey(),
  idempotencyKey:text('idempotency_key').notNull().unique(),
  payloadHash:text('payload_hash').notNull(),
  kind:text('kind').notNull(),
  payload:text('payload').notNull(),
  createdAt:integer('created_at').notNull(),
  status:text('status').notNull().default('pending'),
}, t=>[index('enquiries_created_at_idx').on(t.createdAt)]);
export const rateLimits=sqliteTable('rate_limits',{
  key:text('key').primaryKey(),
  count:integer('count').notNull(),
  expiresAt:integer('expires_at').notNull(),
});

// Sprint 1 transaction spine. The SQL migration is authoritative for checks,
// immutable-history triggers and indexes used by the D1 deployment.
export const customers=sqliteTable('customers',{
  id:text('id').primaryKey(),name:text('name').notNull(),company:text('company').notNull(),
  email:text('email').notNull(),whatsapp:text('whatsapp').notNull(),createdAt:integer('created_at').notNull(),
});
export const procurementRequests=sqliteTable('procurement_requests',{
  id:text('id').primaryKey(),customerId:text('customer_id').notNull().references(()=>customers.id),
  status:text('status').notNull(),version:integer('version').notNull(),currentQuoteVersion:integer('current_quote_version'),
  accessTokenHash:text('access_token_hash').notNull(),idempotencyKey:text('idempotency_key').notNull().unique(),
  payloadHash:text('payload_hash').notNull(),destinationCountry:text('destination_country').notNull(),
  postalCode:text('postal_code').notNull(),targetPrice:text('target_price').notNull(),
  requestedService:text('requested_service').notNull(),
  qcRequirement:text('qc_requirement').notNull(),notes:text('notes').notNull(),
  lastMutationId:text('last_mutation_id'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('procurement_requests_status_created_idx').on(t.status,t.createdAt)]);
export const procurementRequestItems=sqliteTable('procurement_request_items',{
  id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>procurementRequests.id),
  description:text('description').notNull(),quantity:integer('quantity').notNull(),
  variantSpecification:text('variant_specification').notNull(),notes:text('notes').notNull(),
},t=>[index('procurement_request_items_request_idx').on(t.requestId)]);
export const productSources=sqliteTable('product_sources',{
  id:text('id').primaryKey(),requestItemId:text('request_item_id').notNull().references(()=>procurementRequestItems.id),
  url:text('url').notNull(),platform:text('platform').notNull(),
  detectionSource:text('detection_source').notNull(),createdAt:integer('created_at').notNull(),
});
export const supplierInformation=sqliteTable('supplier_information',{
  requestItemId:text('request_item_id').primaryKey().references(()=>procurementRequestItems.id),
  verifiedTitle:text('verified_title').notNull(),supplierName:text('supplier_name').notNull(),
  supplierUrl:text('supplier_url').notNull(),priceCnyFen:integer('price_cny_fen').notNull(),
  moq:integer('moq').notNull(),domesticFreightCnyFen:integer('domestic_freight_cny_fen').notNull(),
  leadTimeDays:integer('lead_time_days').notNull(),internalNotes:text('internal_notes').notNull(),
  verifiedAt:integer('verified_at').notNull(),
});
export const quotes=sqliteTable('quotes',{
  id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>procurementRequests.id),
  version:integer('version').notNull(),currency:text('currency').notNull(),
  totalMinor:integer('total_minor').notNull(),validUntil:text('valid_until').notNull(),
  operatorNotes:text('operator_notes').notNull(),customerNotes:text('customer_notes').notNull(),
  publishedAt:integer('published_at').notNull(),
});
export const quoteItems=sqliteTable('quote_items',{
  id:text('id').primaryKey(),quoteId:text('quote_id').notNull().references(()=>quotes.id),
  category:text('category').notNull(),description:text('description').notNull(),
  amountMinor:integer('amount_minor').notNull(),displayOrder:integer('display_order').notNull(),
},t=>[index('quote_items_quote_idx').on(t.quoteId,t.displayOrder)]);
export const events=sqliteTable('events',{
  id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>procurementRequests.id),
  type:text('type').notNull(),actorType:text('actor_type').notNull(),fromStatus:text('from_status'),
  toStatus:text('to_status'),quoteVersion:integer('quote_version'),
  publicMessage:text('public_message').notNull(),internalMessage:text('internal_message').notNull(),
  createdAt:integer('created_at').notNull(),
},t=>[index('events_request_created_idx').on(t.requestId,t.createdAt)]);
export const notifications=sqliteTable('notifications',{
  id:text('id').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),
  requestId:text('request_id').notNull().references(()=>procurementRequests.id),
  type:text('type').notNull(),recipientRole:text('recipient_role').notNull(),
  status:text('status').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('notifications_created_idx').on(t.createdAt)]);
