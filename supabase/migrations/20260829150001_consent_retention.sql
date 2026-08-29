-- Runbook Step 36 — consent-event retention/deletion job support.
--
-- `consent_events_append_only` (Step 9, `20260824130004_history_and_delivery.sql`)
-- blocks every UPDATE/DELETE on `consent_events` unconditionally, for any
-- role including service_role — a deliberate, correct choice for a
-- tamper-evident consent ledger, and status_events/audit_events keep that
-- exact same unconditional protection unchanged here.
--
-- `release-gates-v2.md` Gate 0's "retention/deletion schedule" and Gate 8's
-- consent requirements still need a real deletion path once a retention
-- window expires. A blanket-immutable table cannot ever satisfy that, so
-- this migration adds one narrow, explicit, auditable exception: a
-- SECURITY DEFINER function that only a scheduled retention job may call
-- (never ordinary application code, and never a raw DELETE statement),
-- gated by a transaction-local flag the row trigger checks for. Everything
-- else about the table — every ordinary INSERT/SELECT, every other
-- attempted UPDATE/DELETE — behaves exactly as before.

create or replace function forbid_consent_row_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and coalesce(current_setting('app.consent_retention_job', true), 'false') = 'true'
  then
    return old;
  end if;
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = '23514';
end;
$$;

comment on function forbid_consent_row_change() is
  'Same append-only guarantee as forbid_row_change() (status_events/audit_events), plus one narrow exception: a DELETE is allowed only inside purge_expired_consent_events''s own transaction-local flag. Never bypassed by an ordinary UPDATE, and never by a DELETE from outside that function.';

drop trigger consent_events_append_only on consent_events;

create trigger consent_events_append_only
  before update or delete on consent_events
  for each row execute function forbid_consent_row_change();

create or replace function purge_expired_consent_events(retention_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  if retention_days is null or retention_days < 1 then
    raise exception 'retention_days must be a positive integer';
  end if;

  perform set_config('app.consent_retention_job', 'true', true);

  delete from public.consent_events
  where created_at < now() - make_interval(days => retention_days);

  get diagnostics purged_count = row_count;

  perform set_config('app.consent_retention_job', 'false', true);

  return purged_count;
end;
$$;

comment on function purge_expired_consent_events(integer) is
  'The only permitted way to remove consent_events rows, and only rows past retention_days. Called by the Step 36 retention cron job (GET /api/cron/consent-retention), never by ordinary application code. Returns the purged row count for audit logging by the caller — the caller is responsible for recording that count, e.g. to audit_events.';

revoke all on function purge_expired_consent_events(integer) from public;
grant execute on function purge_expired_consent_events(integer) to service_role;
