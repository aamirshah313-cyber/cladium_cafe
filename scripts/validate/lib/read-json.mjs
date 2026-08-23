import { readFileSync } from 'node:fs';

export function readJsonFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: `Cannot read file: ${err.message}` };
  }
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err.message}` };
  }
}
