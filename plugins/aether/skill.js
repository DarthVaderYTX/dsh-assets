/**
 * Standard-format skill document loader for Aether.
 *
 * The skill lives in skills/aether/SKILL.md with YAML frontmatter, the same
 * layout used by the other bundled assets. The Host registers it as a runtime
 * skill during plugin apply, so it is disposed with the plugin fiber.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const AETHER_SKILL_DIRECTORY = path.join(here, 'skills', 'aether');
const skillFile = path.join(AETHER_SKILL_DIRECTORY, 'SKILL.md');

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseDocument(raw) {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new Error('aether skill is missing YAML frontmatter.');
  }
  const end = normalized.indexOf('\n---', 4);
  if (end < 0) throw new Error('aether skill frontmatter is not closed.');

  const meta = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    meta[match[1]] = unquote(match[2]);
  }

  const name = meta.name || '';
  const description = meta.description || '';
  if (name === '' || description === '') {
    throw new Error('aether skill requires name and description frontmatter.');
  }
  if (description.length > 480) {
    throw new Error('aether skill description must be at most 480 characters.');
  }

  const content = normalized.slice(end + 4).replace(/^\n+/, '').trimEnd();
  if (!content.trim()) throw new Error('aether skill content is empty.');

  return {
    name,
    description,
    ...(meta.whenToUse ? { whenToUse: meta.whenToUse } : {}),
    source: 'runtime',
    invocation: {
      modelInvocable: meta['disable-model-invocation'] !== 'true',
      userInvocable: meta['user-invocable'] !== 'false',
    },
    content,
  };
}

export const AETHER_SKILL = parseDocument(readFileSync(skillFile, 'utf8'));
