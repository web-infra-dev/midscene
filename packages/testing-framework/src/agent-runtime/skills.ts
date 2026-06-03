/**
 * `$name` skill references (RFC §4).
 *
 * The framework does NOT register or activate skills. It only statically
 * extracts the `$name` tokens from a node's instruction so it can:
 *   1. surface them to the agent as a strong load hint, and
 *   2. optionally validate that the referenced skills exist.
 *
 * Actual loading/activation is Pi's job (progressive disclosure).
 */

// $name: starts with `$`, then a letter/underscore, then word chars or hyphens.
const SKILL_TOKEN = /\$([A-Za-z_][A-Za-z0-9_-]*)/g;

/** Extract the unique set of `$name` skill references from an instruction. */
export function extractSkillReferences(instruction: string): string[] {
  if (!instruction) return [];
  const found = new Set<string>();
  for (const match of instruction.matchAll(SKILL_TOKEN)) {
    found.add(match[1]);
  }
  return [...found];
}
