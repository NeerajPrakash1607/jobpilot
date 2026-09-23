import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

export const sources=sqliteTable('watch_sources',{
 id:text('id').primaryKey(),definition:text('definition'),lastAttempt:integer('last_attempt'),lastSuccess:integer('last_success'),
 status:text('status').notNull().default('unchecked'),partial:integer('partial').notNull().default(0),
 count:integer('count').notNull().default(0),skipped:integer('skipped').notNull().default(0),
 failureDays:integer('failure_days').notNull().default(0),lastFailureDay:text('last_failure_day'),outageStarted:integer('outage_started'),
 lockToken:text('lock_token'),lockedUntil:integer('locked_until').notNull().default(0),error:text('error'),
});
export const vacancies=sqliteTable('watch_vacancies',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull(),payload:text('payload').notNull(),
 firstSeen:integer('first_seen').notNull(),lastSeen:integer('last_seen').notNull(),
 misses:integer('misses').notNull().default(0),open:integer('open').notNull().default(1),
},t=>[index('idx_watch_vacancies_source_open').on(t.sourceId,t.open)]);
export const accounts=sqliteTable('watch_accounts',{
 id:text('id').primaryKey(),email:text('email').notNull(),name:text('name').notNull(),createdAt:integer('created_at').notNull(),
 preferences:text('preferences').notNull().default('{}'),status:text('status').notNull().default('inactive'),
 optedAt:integer('opted_at'),alertsSince:integer('alerts_since'),unsubscribeHash:text('unsubscribe_hash').notNull(),
},t=>[index('idx_watch_accounts_status_opted').on(t.status,t.optedAt),uniqueIndex('idx_watch_accounts_unsubscribe').on(t.unsubscribeHash)]);
export const sessions=sqliteTable('watch_sessions',{
 tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_watch_sessions_expiry').on(t.expiresAt)]);
export const deliveries=sqliteTable('watch_deliveries',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),
 day:text('day').notNull(),state:text('state').notNull(),createdAt:integer('created_at').notNull(),
 updatedAt:integer('updated_at').notNull(),payload:text('payload').notNull(),
},t=>[uniqueIndex('idx_watch_deliveries_account_day').on(t.accountId,t.day),index('idx_watch_deliveries_state').on(t.state)]);
export const deliveredJobs=sqliteTable('watch_delivered_jobs',{
 accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),jobId:text('job_id').notNull(),deliveryId:text('delivery_id').notNull(),
},t=>[primaryKey({columns:[t.accountId,t.jobId]})]);
export const requests=sqliteTable('watch_requests',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),name:text('name').notNull(),url:text('url').notNull(),createdAt:integer('created_at').notNull(),
 sourceId:text('source_id'),
},t=>[uniqueIndex('idx_watch_requests_account_url').on(t.accountId,t.url)]);
export const system=sqliteTable('watch_system',{key:text('key').primaryKey(),value:text('value').notNull()});

export const outageNotices=sqliteTable('watch_outage_notices',{
 accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),sourceId:text('source_id').notNull(),
 outageStarted:integer('outage_started').notNull(),deliveryId:text('delivery_id').notNull(),
},t=>[primaryKey({columns:[t.accountId,t.sourceId,t.outageStarted]}),index('idx_watch_outage_notices_delivery').on(t.deliveryId)]);
