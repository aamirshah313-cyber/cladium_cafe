# Read-only source/menu/asset validation tooling

Runbook Phase 0, Step 3. Zero application dependencies — Node.js built-ins only (`node:fs`, `node:path`, `node:url`, `node:test`, `node:assert`). Nothing here installs packages, scaffolds the application, or mutates `cladium-research/data/*.json`.

## Run the tests

```sh
node --test "scripts/validate/**/*.test.mjs"
```

## Run the validators and regenerate the owner sign-off report

```sh
node scripts/validate/run-all.mjs
```

Writes `cladium-research/data/validation/owner-signoff-report.md` and exits non-zero if any hard error is found (a warning alone does not fail the run).

## What is checked

- `business-profile.json` — required non-negotiable facts (hours, no delivery, takeaway, décor floor price, no cakes, no outside food) match exactly; WhatsApp number format is sanity-checked, not rewritten.
- `menu.json` — required top-level keys, currency, integer-PKR price shapes (`price_pkr` xor `prices_pkr`, no floats/zero/negative), and duplicate item names within a category. Items are counted by walking **both** shapes a category can use — a flat `items: [...]` array, and/or one level of named `groups: [{ name, items: [...] }]` (e.g. "Steaks" splits into "Chicken"/"Beef" groups; "Bar Menu" splits into five drink groups). A category with zero items under either shape is reported as a Gate 2 owner/source-image issue — never filled in with invented items.
- **Baseline drift guard** — `validators/menu.mjs` pins the Step 3 hand-verified totals (118 items / 12 categories / 100 single-price / 18 variant-price / 0 missing price / 0 empty categories / 8 source pages) in `VERIFIED_MENU_BASELINE`. `run-all.mjs` hard-fails if a run's actual totals differ from that baseline in either direction. A real, deliberate source-data change must update `VERIFIED_MENU_BASELINE` by hand after re-verifying the new numbers, with the change recorded in `.continuum/DECISIONS.md` — the script will never silently widen the baseline to match a changed file.
- Menu source-asset references — every path in `menu.json`'s `source_assets` is checked against the file that must exist on disk.
- `approved-operations-knowledge.md` — cross-checked for the presence of each non-negotiable policy phrase, so a future edit can't silently drop one.

## Why a baseline guard exists

Step 1's original ad hoc audit script only read the flat `items` shape and reported Steaks/Burgers/Bar Menu/BBQ as empty (52 items total). That was wrong — those categories nest items under `groups[].items`; the real, correct count is 118. See `.continuum/DECISIONS.md` D-014/D-015. `VERIFIED_MENU_BASELINE` exists so a similar silent miscount — in either direction — fails the run instead of being trusted.

## Adding a check

Add a pure function to `validators/`, call it from `run-all.mjs`, and add a `node:test` case in `validate.test.mjs`. Keep validators read-only and dependency-free.
