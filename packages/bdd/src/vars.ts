/**
 * Runtime variable substitution and capture for @midscene/bdd.
 *
 * Reuses Gherkin's `<placeholder>` visual for runtime variables. Scenario
 * Outline placeholders are substituted at compile time by Gherkin, so any
 * identifier-shaped `<name>` left in a pickle step at runtime is, by
 * definition, a runtime variable reference.
 */
import { ERROR_PREFIX, IDENT_RE_SOURCE, type VarScope } from './types';

const PLACEHOLDER_RE = new RegExp(`<(${IDENT_RE_SOURCE})>`, 'g');

const REMEMBER_RE = new RegExp(
  `^I remember (.+?) as "(${IDENT_RE_SOURCE})"[.]?$`,
  'i',
);

/**
 * Replace `<name>` placeholders with values from `vars`. Unknown
 * identifier-shaped placeholders throw; non-identifier `<...>` content is
 * left untouched.
 */
export function substituteVars(text: string, vars: VarScope): string {
  return text.replace(PLACEHOLDER_RE, (full, name: string) => {
    const value = vars.get(name);
    if (value === undefined) {
      const known =
        vars.size > 0 ? Array.from(vars.keys()).join(', ') : '(none)';
      throw new Error(
        `${ERROR_PREFIX} unknown variable <${name}> in step "${text}". Known variables: ${known}`,
      );
    }
    return value;
  });
}

/**
 * Match the `I remember <description> as "<varName>"` capture statement.
 * Returns undefined when the text is not a remember statement.
 */
export function matchRemember(
  text: string,
): { description: string; varName: string } | undefined {
  const m = REMEMBER_RE.exec(text);
  if (!m) return undefined;
  return { description: m[1], varName: m[2] };
}

const REMEMBER_SHAPE_RE = /^I remember .+ as "([^"]*)"[.]?$/i;

/**
 * Detect a remember-INTENT step whose quoted variable name is not a valid
 * identifier (`order-id`, `order id`, ...). Without this check the step
 * would silently fall through to the UI agent and the later `<order-id>`
 * reference would reach the model as a literal placeholder.
 */
export function matchMalformedRemember(
  text: string,
): { varName: string } | undefined {
  if (REMEMBER_RE.test(text)) return undefined;
  const m = REMEMBER_SHAPE_RE.exec(text);
  if (!m) return undefined;
  return { varName: m[1] };
}
