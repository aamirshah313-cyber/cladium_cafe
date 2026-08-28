# Voice quality bake-off plan

Status: **plan prepared, not executed.** Runbook Step 34, `release-gates-v2.md` Gate 6's own closing bullet: "The selected speech stack meets owner-approved comprehension/latency quality; choice is based on the bake-off, not a default assumption."

**This step cannot be executed inside this sandbox.** It requires real Pakistani English/Urdu speakers, their informed consent, a live `ANTHROPIC_API_KEY`-equivalent live Vapi credential set (`VAPI_ORG_ID`/`VAPI_PRIVATE_KEY`/`VAPI_ASSISTANT_EN_ID`/`VAPI_ASSISTANT_UR_ID`), and real assistants actually deployed per `docs/vapi-deployment.md`'s procedure (none of which exist here — same standing limitation as D-017/D-031/D-035). What *is* buildable now, and is this document, is the full test protocol: scenarios, conditions, scoring rubric, consent process, and the decision procedure for filling in `modules/voice/profiles/templates.ts`'s `voiceStack` once real scores exist. Nothing here is a recording, a score, or a selected profile — inventing any of those would violate `CLAUDE.md`'s "never invent... availability... or invented imagery/content" and this gate's own explicit "not a default assumption."

## Prerequisites (all must be true before a session runs)

- [ ] A live Vapi org with `VAPI_ASSISTANT_EN_ID`/`VAPI_ASSISTANT_UR_ID` assistants created from `modules/voice/profiles/templates.ts`'s `development` (or `preview`) cell, per `docs/vapi-deployment.md`.
- [ ] `POST /api/vapi/token`/`POST /api/vapi/tools`/`POST /api/vapi/webhook` reachable from a real, deployed (or tunnelled) environment — not this sandbox, which has no live `VAPI_*` secrets.
- [ ] At least 4 real Pakistani English speakers and 4 real Pakistani Urdu speakers recruited, spanning different ages/accents/regions where practical. Fewer than 4 per language makes "selected" claims statistically thin; more is better if available.
- [ ] Each participant has signed a **written, specific consent form** (see "Consent and recording protocol" below) *before* any call starts — never retroactively.
- [ ] `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` enabled only in the test environment, never production, until this gate passes.
- [ ] A facilitator with a scoring sheet (see "Scoring rubric") for each session, and a second observer where possible for inter-rater consistency.

## Test conditions matrix

Every scenario in the catalogue below is run at least once per condition cell that applies to it:

| Condition | Description |
| --- | --- |
| Quiet indoor | Low ambient noise, good signal, wired or good Bluetooth mic. |
| Noisy mobile | Café/street-level ambient noise, phone speaker/mic, walking or a moving vehicle (passenger, not driver). |
| Weak network | Throttled/variable mobile data (3G-equivalent or worse) to observe latency and reconnect behaviour. |

## Test scenario catalogue

Grounded in real, currently-approved data (`cladium-research/data/menu.json`, `agent/approved-operations-knowledge.md`) — the facilitator reads a real menu item name/asks a real policy question, never an invented one, and scores whether the SYSTEM's spoken answer matches the approved fact exactly (per `CLAUDE.md`: "never invent... prices, allergies, availability").

1. **English hours/location/contact** — "What time do you open?", "Where are you located?", "What's your WhatsApp number?"
2. **Urdu (script-spoken) hours/location/contact** — the same three questions, spoken in Urdu.
3. **Roman Urdu / code-switching** — e.g. "aap ka time kya hai?", "kya treehouse available hai?", switching mid-sentence between English and Urdu the way a real bilingual guest naturally would.
4. **Menu names** — asking about real items by name (e.g. "Do you have the Cladium Special Sandwich?", "Chicken Peshawari Karahi kya hai?", "Chicken Shinwari"), including items with variant pricing, and at least one item deliberately mispronounced/anglicized to test speech-recognition robustness.
5. **Prices** — "How much is the [real item]?" — score whether the number is transcribed/spoken correctly (PKR digit strings are a known hard case for TTS/ASR — e.g. "PKR eight thousand" vs. misheard digits).
6. **Dates and times** — requesting a booking for a specific date/time ("Friday evening", "the 15th at 7 pm", relative dates like "tomorrow") and confirming the system captured them correctly in the drafted review card.
7. **Numbers** — party size, guest count, phone numbers (a famously hard ASR case for Urdu-accented digit strings).
8. **Corrections** — the guest deliberately restates/corrects a detail mid-conversation ("actually, make that 6 people, not 4") and the drafted review must reflect the correction, not the original.
9. **Interruption** — the guest speaks while the assistant is still talking; score whether the assistant yields gracefully rather than talking over/ignoring the guest.
10. **No-match recovery** — a question genuinely outside the tool set (something not in `getMenu`/`getVenueInfo`); score whether the assistant says so plainly and offers the WhatsApp handoff rather than guessing (per `design/localization-and-rtl.md`).
11. **Denied microphone permission** — the guest declines the browser mic prompt; score whether the UI shows `voiceErrorPermissionDenied` clearly (already built and unit-tested, Step 33 — this session verifies the *live* SDK/browser combination actually reaches that state, not the app logic).
12. **Disconnect/reconnect** — kill the network mid-call; score whether the UI reaches a clear error/ended state rather than hanging silently.
13. **Latency** — measured wall-clock time from the guest finishing a sentence to the assistant's audio starting, across all the above scenarios; log per-scenario, not just an average.
14. **Handoff** — a scenario deliberately pushed past what the assistant should handle alone (e.g. a complex tax/payment question) and scored on whether it reaches the safe WhatsApp-pointing fallback (`ESCALATION_REPLY`/`FALLBACK_REPLY`, already built in `orchestrator.ts` — Step 27) within a reasonable number of turns.
15. **In-call language switch** (bonus, from `localization-and-rtl.md`'s own requirement beyond the runbook's Step 34 list) — the guest switches the active language mid-call and the assistant follows without losing safe session state.

## Scoring rubric

Each scenario × condition cell gets a facilitator score on a 1–5 scale per dimension, plus free-text notes:

| Dimension | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Transcription accuracy | Guest's speech consistently misheard/garbled | Occasional errors, guest usually has to repeat once | Consistently accurate on first attempt |
| Response correctness | Assistant states a wrong/invented fact | Correct but slow/roundabout | Correct, natural, and prompt |
| Latency (subjective) | Guest notices an uncomfortable pause every turn | Noticeable but tolerable | Feels conversational |
| Naturalness of voice output | Robotic/hard to understand | Understandable, some artificiality | Natural, easy to follow |
| Interruption/correction handling | Ignores or breaks | Handles with a visible stumble | Smooth |
| Safety (no invented facts/no false confirmation) | Any invented price/availability/confirmation | N/A — this is pass/fail, not a scale | Never invents, always defers correctly |

"Safety" is the one dimension with veto power: any invented price, availability claim, or false confirmation of a booking/order in *any* session — across *any* provider/voice combination tested — disqualifies that profile from `SELECTED` status regardless of every other score, per `CLAUDE.md`'s non-negotiable rules. This is checked against the same `CONCIERGE_SYSTEM_POLICY`/approved-facts source every automated eval (Step 29) already checks against, just now under real live-model, live-voice conditions the sandbox eval suite's `requiresLiveModel: true` cases couldn't reach.

## Consent and recording protocol

- Recording is **off in the product** by default (`CLAUDE.md`, Step 30's `recordingEnabled: false`) and stays off in production regardless of this bake-off's outcome unless a separate, later recording-consent/retention gate is approved (`release-gates-v2.md` Gate 6: "If it is ever enabled, a separate recording-consent and retention gate must pass first").
- For *this specific test-only purpose*, a participant may consent to a session recording used only for facilitator scoring review, never for training a model, never published, and deleted after the bake-off report is finalized (a fixed, stated retention window — recommend no more than 30 days after the owner-acceptance sign-off below).
- Consent must be written, specific to this purpose, obtained before the session starts, and revocable — a participant may withdraw and have their recording deleted at any time.
- No participant's name, phone number, or other directly identifying detail is stored in the results/report artifacts below — use a session code (e.g. `EN-01`, `UR-03`) instead.
- This protocol is a *facilitator* requirement to run the test; it is separate from and does not itself satisfy Gate 0's "privacy notice, retention/deletion schedule, consent copy... owner/legal reviewed" bullet for the *production* microphone-consent UI, which is Step 36's job.

## Session procedure

1. Facilitator confirms consent is signed and explains the guest can stop at any time.
2. Guest starts a call via the real `/concierge` Talk panel (Step 33), selecting their language.
3. Facilitator runs through the scenario catalogue for that participant's assigned condition (quiet/noisy/weak-network), scoring live and noting timestamps for anything worth reviewing later.
4. Facilitator confirms the drafted review card (if any) matches what the guest actually asked for, then has the guest explicitly **not** tap Confirm (bake-off sessions are test-only; no real request should be submitted to staff) — dismiss instead.
5. Session ends; facilitator finalizes the score sheet within the same day while memory is fresh.

## Results and reporting

Aggregate results per (locale × condition × scenario) into a single report, `cladium-research/data/validation/voice-bake-off-report.md` (created only once real sessions exist — a template header only is acceptable to commit ahead of time, never fabricated scores). The report must include:

- Every session's scores (by session code, never a real name).
- Every safety-dimension failure, verbatim, regardless of how the profile otherwise scored.
- A clear recommendation: which provider/voice/transcriber combination for English, and separately for Urdu, is recommended — or a statement that none tested met the bar and further evaluation is needed.
- The owner's explicit written acceptance of the recommendation (a name, date, and decision — "approved" or "not approved, needs further testing").

## Turning results into code

Only after the report above exists and is owner-accepted:

1. Update `modules/voice/profiles/templates.ts`'s `voiceStack` for the relevant environment/locale cell(s) from `{ status: 'PENDING_BAKEOFF' }` to `{ status: 'SELECTED', provider, voiceId, transcriber, selectedAt, evidenceRef }`, where `evidenceRef` points at the report above.
2. Bump `configVersion` and add a `CHANGELOG.md` entry (`modules/voice/profiles/CHANGELOG.md`'s own "whenever it changes" checklist).
3. Re-run `tests/unit/voice-profiles.test.ts` — the "every cell is still PENDING_BAKEOFF" test will now correctly fail for the updated cell(s) and must itself be updated to reflect the real, evidence-backed selection, not simply relaxed.
4. Follow `docs/vapi-deployment.md`'s promotion order (development → preview → production) to actually configure the chosen voice/transcriber on each real Vapi assistant.
