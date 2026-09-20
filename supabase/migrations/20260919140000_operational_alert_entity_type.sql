-- Adds `OPERATIONAL_ALERT` to the `entity_type` enum, so a fired alert can
-- travel through the existing outbox → `staff_notifications` pipeline
-- instead of needing a second delivery mechanism of its own.
--
-- Its own migration, separate from `20260919140500`'s tables, on purpose:
-- a new enum value cannot be *used* in the same transaction that adds it.
-- Splitting them means the tables migration can reference the value freely,
-- and neither file has to care about that restriction.
--
-- Purely additive. Existing values are untouched, so every existing row,
-- policy, and check constraint keeps its current meaning; nothing reads
-- this value until the alerting cron enqueues its first event.
--
-- Why an enum value rather than reusing an existing one: `outbox_events`
-- and `staff_notifications` both type `entity_type` as this enum, and
-- labelling an infrastructure alert as a `BOOKING_REQUEST` would make it
-- indistinguishable from a real guest request in the staff queue — the
-- opposite of what an alert is for.

alter type entity_type add value if not exists 'OPERATIONAL_ALERT';
