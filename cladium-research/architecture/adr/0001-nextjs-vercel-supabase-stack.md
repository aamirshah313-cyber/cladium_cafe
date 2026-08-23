# ADR-0001: Next.js on Vercel Pro with Supabase Pro

Status: accepted

## Context

Cladium needs one production-quality, bilingual, dual-theme web application plus a text/voice concierge, backed by real persistence, auth, RLS, realtime, and backups — not a static site or a set of disconnected services.

## Decision

One Next.js App Router application, TypeScript strict mode, React Server Components by default, deployed to Vercel Pro (Node.js runtime for secrets, database access, signatures, and webhooks). Supabase Pro provides PostgreSQL, Auth, Storage, Realtime, RLS, backups, and staff MFA, with isolated development/preview/production projects.

## Rejected alternatives

- **Netlify** — technically compatible but explicitly not the implementation target (`deployment-target.md`); would need a deliberate, separately approved target change.
- **Split frontend/backend services** — unnecessary operational complexity for the launch's scope; one deployable keeps the domain layer and route handlers co-located.
- **Self-managed PostgreSQL** — loses managed RLS, Auth, backups, and MFA that Supabase Pro provides out of the box.

## Reversible boundary

Vercel and Supabase are accessed only through typed adapters (see ADR-0008); domain services never import provider SDKs directly, so either could be replaced without rewriting business logic.

## Source

`production-architecture-v2.md` §2–3, §13; `deployment-target.md`.
