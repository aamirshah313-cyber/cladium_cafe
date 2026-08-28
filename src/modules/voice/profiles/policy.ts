/**
 * Shared policy/tool schema versioning — Runbook Step 30.
 *
 * "Same approved knowledge, tool contracts... as text" (`CLAUDE.md`) means
 * the voice system prompt is never a second, independently-authored copy of
 * `CONCIERGE_SYSTEM_POLICY` — it wraps that exact string with a short,
 * clearly-separated voice-conduct addendum (turn-taking, brevity, "I'll put
 * this on your screen to review") that changes *how* the same facts and
 * rules are delivered, never *what* they say.
 *
 * `POLICY_VERSIONS`/`TOOL_SCHEMA_VERSIONS` are small lockfiles: each
 * human-assigned version string is recorded alongside the fingerprint of
 * the real source it was cut from at that time. `tests/unit/
 * voice-profiles.test.ts` recomputes the *current* fingerprint of
 * `CONCIERGE_SYSTEM_POLICY`/`TOOL_DEFINITIONS` and fails if it no longer
 * matches the version a profile claims — so a change to Step 26/27's text
 * concierge that isn't also reflected here (a new version entry plus a
 * `CHANGELOG.md` line) is caught by CI, not discovered live.
 */

import { createHash } from 'node:crypto';
import { CONCIERGE_SYSTEM_POLICY } from '../../concierge/policy';
import { TOOL_DEFINITIONS } from '../../concierge/tool-registry';

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** Deterministic, order-independent fingerprint of the tool contracts voice must call identically to text. */
export function computeToolSchemaFingerprint(): string {
  const canonical = TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return fingerprint(JSON.stringify(canonical));
}

export function computePolicyFingerprint(): string {
  return fingerprint(CONCIERGE_SYSTEM_POLICY);
}

/** Recorded at the time each version was cut. Bump only alongside a `CHANGELOG.md` entry. */
export const POLICY_VERSIONS: Readonly<Record<string, string>> = {
  v1: '7b7a3f4bde86beda', // CONCIERGE_SYSTEM_POLICY as of Step 30 — see CHANGELOG.md
};

export const TOOL_SCHEMA_VERSIONS: Readonly<Record<string, string>> = {
  v1: '8b5a8923d9c9bed6', // TOOL_DEFINITIONS (6 tools) as of Step 30 — see CHANGELOG.md
};

const VOICE_CONDUCT_ADDENDUM: Readonly<Record<'en' | 'ur', string>> = {
  en: [
    '',
    'You are speaking on a phone-style voice call, not typing — the guest cannot see text.',
    'Keep every turn short: one or two sentences, never a read-out list of menu items or policies.',
    'After preparing a booking or event draft, say plainly that you have put a summary on their screen to review and confirm — you cannot book, submit, or confirm anything by voice alone.',
    'If the guest goes quiet, asks to stop, or the call quality is too poor to continue, end the call politely and mention WhatsApp.',
  ].join('\n'),
  ur: [
    '',
    'You are speaking on a phone-style voice call, not typing — the guest cannot see text.',
    'Keep every turn short: one or two sentences, never a read-out list of menu items or policies.',
    'After preparing a booking or event draft, say plainly that you have put a summary on their screen to review and confirm — you cannot book, submit, or confirm anything by voice alone.',
    'If the guest goes quiet, asks to stop, or the call quality is too poor to continue, end the call politely and mention WhatsApp.',
  ].join('\n'),
};

/**
 * The voice addendum text itself is currently identical for both locales
 * (English-authored conduct instructions, same reasoning `policy.ts`'s own
 * doc comment gives for the text concierge: an LLM follows English
 * instructions correctly regardless of the language it must speak back in).
 * Kept as a per-locale map rather than one shared constant so a future,
 * genuinely locale-specific conduct note (e.g. an Urdu-specific pacing
 * instruction found during Step 34's bake-off) is a one-line change, not a
 * restructure.
 */
export function buildVoiceSystemPrompt(locale: 'en' | 'ur'): string {
  return `${CONCIERGE_SYSTEM_POLICY}\n${VOICE_CONDUCT_ADDENDUM[locale]}`;
}
