/**
 * Shared cucumber-expression matching for flow names (flows.ts) and string
 * step patterns (no-ai.ts): compile once at registration, fall back to a
 * literal exact-match when the pattern is not a valid expression, and coerce
 * nullish captures to '' so both consumers agree on argument semantics.
 */
import {
  CucumberExpression,
  ParameterTypeRegistry,
} from '@cucumber/cucumber-expressions';

export type TextMatcher = (text: string) => string[] | undefined;

const parameterTypeRegistry = new ParameterTypeRegistry();

export function toArgString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

export function compileTextMatcher(pattern: string): TextMatcher {
  let expression: CucumberExpression | undefined;
  try {
    expression = new CucumberExpression(pattern, parameterTypeRegistry);
  } catch {
    // Not a valid cucumber expression (e.g. unbalanced braces) — literal
    // exact-match with zero captures.
    expression = undefined;
  }
  if (expression) {
    const compiled = expression;
    return (text) => {
      const args = compiled.match(text);
      if (!args) return undefined;
      return args.map((arg) => toArgString(arg.getValue(null)));
    };
  }
  return (text) => (text === pattern ? [] : undefined);
}
