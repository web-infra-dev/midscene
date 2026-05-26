/**
 * Internal-only helpers for CLI/MCP argument key aliasing.
 * Not re-exported from the package entry point — keep consumers within
 * `cli/` and `mcp/`.
 */

export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function camelToKebab(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^-/, '');
}

export function getKeyAliases(key: string): string[] {
  return [...new Set([key, kebabToCamel(key), camelToKebab(key)])];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
