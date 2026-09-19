-- Widen `customer_sessions.theme` to accept the four warm venue themes.
--
-- `themeSchema` (lib/schemas/common.ts) now offers six themes. This
-- constraint is the one place outside the application that enumerates them,
-- so without this a guest choosing Peach or Golden has their session write
-- rejected by the database while the page itself renders perfectly -- a
-- failure that surfaces nowhere near the switcher that caused it.
--
-- Additive in effect (D-046): the set of accepted values only grows, so every
-- existing row stays valid and nothing is rewritten. A check constraint cannot
-- be altered in place, so it is dropped and recreated under the same name.
-- `not valid` is deliberately NOT used: validating immediately against a table
-- this small is cheap, and it proves the widened rule actually holds.
--
-- Rollback -- only safe once no row uses the new values:
--   update public.customer_sessions set theme = 'day'
--     where theme in ('peach', 'golden', 'terracotta', 'ember');
--   alter table public.customer_sessions
--     drop constraint customer_sessions_theme_allowed,
--     add constraint customer_sessions_theme_allowed
--       check (theme in ('day', 'night'));

alter table public.customer_sessions
  drop constraint customer_sessions_theme_allowed;

alter table public.customer_sessions
  add constraint customer_sessions_theme_allowed
    check (theme in ('day', 'night', 'peach', 'golden', 'terracotta', 'ember'));
