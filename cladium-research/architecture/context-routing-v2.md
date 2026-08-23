# Token-efficient context routing v2

Read root `CLAUDE.md`, `.continuum/PROJECT_STATE.md`, and `.continuum/TASKS.md` at session start. Then load only the row matching the active work. Search first and open the smallest relevant section/file.

| Active work | Required sources | Avoid loading |
| --- | --- | --- |
| Scope/architecture | `production-architecture-v2.md`, relevant ADR | Full menu/assets, legacy runbooks |
| Database/RLS/workflows | `data-model-v2.md`, `agent/tool-contracts.md`, relevant release gates | Brand/gallery/media files |
| Menu import/pricing | `data/menu.json` through validation/normalizer tooling, relevant data-model sections | Copying all 118 items into chat/prompt |
| Business facts/policies | `data/business-profile.json`, `agent/approved-operations-knowledge.md` | Social-media history/raw captures |
| UI/brand | `brand/visual-direction.md`, active page section of `design/site-map.md` | Agent/deployment documents |
| Locale/RTL | `design/localization-and-rtl.md`, translation schema sections | Full runbook/menu unless testing menu rendering |
| Day/Night theme | `design/theme-mode.md`, relevant brand tokens | Agent/data model documents |
| Menu carousel | `design/menu-carousel-reference.md`, menu adapter interface | Original video frames after behavior is understood |
| Text concierge | `agent/system-prompt-draft.md`, `agent/tool-contracts.md`, `agent/acceptance-tests.md`, relevant architecture sections | Full raw menu; use `getMenu` fixtures/tools |
| Vapi voice | voice sections of production architecture/deployment, localization spec, agent contracts/tests | Unrelated public page specs |
| Staff dashboard | data model state/roles/outbox, release gates | Brand/media research unless styling active view |
| WhatsApp/Meta | integration/privacy sections of architecture and release gates | Disabled provider setup not in active scope |
| Deployment/release | `architecture/deployment-target.md`, `operations/release-gates-v2.md`, current test evidence | Legacy runbook and inactive design research |

## Output discipline

- Summarize command output; retain only errors, counts, file paths, and decisions needed for the next action.
- Cite file paths/line locations instead of pasting long source blocks.
- Prefer deterministic scripts for menu counts/schema checks over loading JSON into model context.
- Keep one active runbook step. Do not discuss future phases unless a current decision affects them.
- Do not repeat stable business facts in multiple generated files; link to their source.
- At phase boundaries, compact durable state into `.continuum/` and discard transient exploration from the next prompt.
