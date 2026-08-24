-- Runbook Step 10 — authorization helpers for RLS.
-- production-architecture-v2.md §10, data-model-v2.md §6.
--
-- Two distinct identities reach the database:
--
--   Staff  — real Supabase Auth users. Identified by auth.uid() and resolved
--            to a staff_profile with roles.
--   Guests — never Auth users. The server opens a transaction and sets
--            `app.customer_session_id` with set_config(..., true) so the
--            setting is scoped to that transaction. Safe under the
--            transaction pooler, and it means a guest can only ever see rows
--            belonging to the session the server just authenticated.
--
-- These helpers are SECURITY DEFINER on purpose: they read staff tables that
-- are themselves RLS-protected, and a policy calling an invoker-rights
-- function against a protected table would recurse.

create function current_customer_session_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('app.customer_session_id', true), '')::uuid;
$$;

comment on function current_customer_session_id() is
  'The guest session the server authenticated for this transaction, or null. Set with set_config(''app.customer_session_id'', <id>, true).';

create function current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.staff_profiles p
  where p.user_id = (select auth.uid())
    and p.status = 'ACTIVE';
$$;

comment on function current_staff_id() is
  'Active staff profile for the authenticated user, or null. SECURITY DEFINER to avoid RLS recursion on staff_profiles.';

create function is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles p
    where p.user_id = (select auth.uid()) and p.status = 'ACTIVE'
  );
$$;

create function staff_has_role(required staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles p
    join public.staff_role_memberships m on m.staff_profile_id = p.id
    where p.user_id = (select auth.uid())
      and p.status = 'ACTIVE'
      and m.role = any (required)
  );
$$;

comment on function staff_has_role(staff_role[]) is
  'True when the authenticated staff member holds any of the required roles. Authorization is enforced here AND in service code; hiding UI controls is not authorization.';

-- Convenience predicates used repeatedly below.
create function is_owner_or_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.staff_has_role(array['OWNER', 'MANAGER']::public.staff_role[]);
$$;

-- The single published menu version is the only one the public may read.
create function is_published_menu_version(version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.menu_versions v
    where v.id = version_id and v.published_at is not null
  );
$$;
