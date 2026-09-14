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
