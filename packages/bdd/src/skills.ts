/**
 * Skill discovery and selection for @midscene/bdd.
 *
 * Skills are markdown instruction files referenced from steps via
 * `$skill-name` tokens; their content is appended to the general agent's
 * prompt. Token parsing lives in the annotations module — this module only
 * maps names to content.
 */
import type { Dirent } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ERROR_PREFIX, type Skill } from './types';

/**
 * Discover skills under `dir` (absolute). Supports two layouts:
 * flat `<dir>/<name>.md` and folder `<dir>/<name>/SKILL.md`. A non-existent
 * directory yields an empty map (skills are optional); the same name in both
 * layouts throws. Iteration order is sorted by name.
 */
export async function discoverSkills(dir: string): Promise<Map<string, Skill>> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    throw e;
  }

  const found = new Map<string, { name: string; file: string }>();
  const add = (name: string, file: string) => {
    const existing = found.get(name);
    if (existing) {
      throw new Error(
        `${ERROR_PREFIX} Duplicate skill name "${name}": ${existing.file} and ${file}`,
      );
    }
    found.set(name, { name, file });
  };

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      add(path.basename(entry.name, '.md'), path.join(dir, entry.name));
    } else if (entry.isDirectory()) {
      const file = path.join(dir, entry.name, 'SKILL.md');
      try {
        const stat = await fs.stat(file);
        if (stat.isFile()) add(entry.name, file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
  }

  const skills = new Map<string, Skill>();
  for (const name of Array.from(found.keys()).sort()) {
    const { file } = found.get(name)!;
    const content = await fs.readFile(file, 'utf-8');
    skills.set(name, { name, content, file });
  }
  return skills;
}

/**
 * Resolve `$token` names to skills. Unknown tokens throw with the list of
 * available skill names; duplicates are removed preserving first-mention
 * order.
 */
export function selectSkills(
  tokens: string[],
  skills: Map<string, Skill>,
): Skill[] {
  const selected: Skill[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const skill = skills.get(token);
    if (!skill) {
      const available =
        skills.size > 0
          ? Array.from(skills.keys()).sort().join(', ')
          : '(none)';
      throw new Error(
        `${ERROR_PREFIX} Unknown skill $${token}. Available skills: ${available} (looked in the skills directory)`,
      );
    }
    if (!seen.has(token)) {
      seen.add(token);
      selected.push(skill);
    }
  }
  return selected;
}

/**
 * Render selected skills as a prompt fragment. Empty input renders to ''.
 */
export function renderSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';
  const sections = skills.map(
    (skill) => `## Skill: ${skill.name}\n${skill.content.trim()}\n`,
  );
  return `The following skill instructions are available for this task:\n${sections.join('\n')}`;
}
