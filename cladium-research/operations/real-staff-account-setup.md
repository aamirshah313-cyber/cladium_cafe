# Real staff account setup

Closes Step 45's one hard technical blocker (D-049): real Supabase Auth +
owner/manager MFA now exists in code (D-050). This document is the
procedure for turning that into real, usable accounts — the part only the
account holder can do.

## What's already true

- The database schema (`staff_profiles`, `staff_role_memberships`,
  `staff_requiring_mfa`) has been ready since Step 9/10 — no migration was
  needed for this.
- The application now supports real sign-in, and **enforces** MFA for any
  account holding the `OWNER` or `MANAGER` role: such an account cannot
  reach a signed-in session until it has completed TOTP enrollment.
- Existing `STAFF_DEV_ACCOUNTS` dev sign-ins keep working exactly as
  before — this is additive, not a cutover. Nothing breaks until you
  choose to remove `STAFF_DEV_ACCOUNTS` yourself, later.

## Step 1 — create your own real account (you do this, not Claude)

In the Supabase dashboard for the staging project
(`vxvpxywszskxcugwpsch`):

1. Go to **Authentication → Users → Add user**.
2. Choose **your own** email and password. Use "Auto Confirm User" (or
   confirm the email yourself) so the account is active immediately.
3. Copy the new user's **UUID** shown in the dashboard — this is not a
   secret, safe to share.

Repeat for a manager account, or any other real staff member, if you want
more than one real account right now.

## Step 2 — link the account to a staff profile

Tell me the UUID (and the role — `OWNER`, `MANAGER`, `ORDER_STAFF`,
`BOOKING_STAFF`, or `AUDITOR`) and I'll insert the matching
`staff_profiles`/`staff_role_memberships` rows via the Supabase project
directly — this only needs the UUID and role, no secret, so it's safe to
give me in chat. Equivalently, you can run this SQL yourself in the
Supabase SQL Editor (replace the two placeholders):

```sql
with new_profile as (
  insert into staff_profiles (user_id, display_name)
  values ('<AUTH_USER_UUID>', '<Display Name>')
  returning id
)
insert into staff_role_memberships (staff_profile_id, role)
select id, 'OWNER' -- or 'MANAGER' / 'ORDER_STAFF' / 'BOOKING_STAFF' / 'AUDITOR'
from new_profile;
```

## Step 3 — sign in and enroll MFA (you do this)

1. Go to `/staff` on the deployed site, click **"Sign in with a Supabase
   account"**, and sign in with the email/password from Step 1.
2. Because this is an `OWNER`/`MANAGER` account with no MFA factor yet,
   you'll land on a **"Set up two-factor authentication"** screen
   automatically — this is expected, not an error.
3. Scan the QR code with an authenticator app (Google Authenticator,
   1Password, Authy, etc.), or enter the secret manually.
4. Enter the 6-digit code it shows you to confirm. You'll be signed in
   immediately after.

From then on, every sign-in for that account will ask for a fresh 6-digit
code after your password — that's Gate 3's MFA requirement, now real.

## Notes

- `ORDER_STAFF`/`BOOKING_STAFF`/`AUDITOR` accounts are not required to
  enroll MFA (Gate 3 only names owner/manager) — they'll sign in directly
  with just email+password, the same as today's dev accounts, once linked.
- This is staging only. Repeat this whole procedure for production once a
  separate production Supabase project exists (Gate 3's own "isolated
  projects" requirement).
- `STAFF_DEV_ACCOUNTS` must still never be set in any *production*
  environment (unchanged rule) — remove it from staging too, once you're
  confident every account you actually use has a real, linked profile.
