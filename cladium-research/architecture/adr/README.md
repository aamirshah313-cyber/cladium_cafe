# Architecture decision records

Concise ADRs for the Version 2 build, created at Runbook Phase 0 Step 2. Each records the decision, rejected alternatives, and its reversible boundary. When in doubt, `production-architecture-v2.md` and `data-model-v2.md` remain authoritative; these ADRs explain *why*, not replace them.

- [0001 — Next.js on Vercel Pro with Supabase Pro](0001-nextjs-vercel-supabase-stack.md)
- [0002 — Request-and-confirmation scope, not instant commerce](0002-request-only-scope.md)
- [0003 — Explicit /en and /ur locale routing](0003-bilingual-locale-routing.md)
- [0004 — Day/Night themes via semantic design tokens](0004-day-night-theme-tokens.md)
- [0005 — Server-side Anthropic orchestration behind strict typed tools](0005-server-side-anthropic-tools.md)
- [0006 — Vapi browser voice secured by short-lived JWT and HMAC tool auth](0006-vapi-jwt-hmac-voice-security.md)
- [0007 — Transactional outbox for notification delivery](0007-transactional-outbox.md)
- [0008 — Provider-neutral typed adapters for all external integrations](0008-provider-neutral-adapters.md)
