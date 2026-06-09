/**
 * POC: mechanical `{varName}` substitution against the scenario-scoped
 * variable table. This runs BEFORE any prompt is sent to a model — the model
 * only ever sees the resolved text. Unknown placeholders throw (fail fast on
 * typos rather than letting the model guess).
 */

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export type VariableScope = Map<string, string>;

export function substitute(
  template: string,
  vars: ReadonlyMap<string, string>,
  where: string,
): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars.get(name);
    if (value === undefined) {
      const known = [...vars.keys()].join(', ') || '(none)';
      throw new Error(
        `[midscene] ${where}: unknown variable {${name}}. Variables in scope: ${known}.`,
      );
    }
    return value;
  });
}

/** All `{varName}` placeholder names referenced by a template, in order. */
export function listPlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    names.push(match[1]);
  }
  return names;
}
