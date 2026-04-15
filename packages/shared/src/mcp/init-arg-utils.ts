import type { z } from 'zod';
import { getKeyAliases, isRecord } from '../key-alias-utils';
import type { ToolSchema } from './types';

function readAliasedValue(
  args: Record<string, unknown>,
  key: string,
): unknown | undefined {
  for (const alias of getKeyAliases(key)) {
    if (alias in args) {
      return args[alias];
    }
  }

  return undefined;
}

function readNamespacedArg(
  args: Record<string, unknown>,
  namespace: string,
  key: string,
): unknown | undefined {
  // Lookup order: namespace object first, then flat dotted form, then bare key
  // fallback. Namespace-aware inputs win so multi-platform callers cannot be
  // cross-contaminated by a top-level bare `deviceId` leaking into the wrong
  // platform.
  const namespacedArgs = readAliasedValue(args, namespace);
  if (isRecord(namespacedArgs)) {
    const nestedValue = readAliasedValue(namespacedArgs, key);
    if (nestedValue !== undefined) {
      return nestedValue;
    }
  }

  const dottedValue = readAliasedValue(args, `${namespace}.${key}`);
  if (dottedValue !== undefined) {
    return dottedValue;
  }

  const directValue = readAliasedValue(args, key);
  if (directValue !== undefined) {
    return directValue;
  }

  return undefined;
}

export function extractNamespacedArgs<
  TFieldName extends string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
>(
  args: Record<string, unknown>,
  namespace: string,
  keys: readonly TFieldName[],
): TArgs | undefined {
  const extracted: Record<string, unknown> = {};

  for (const key of keys) {
    const value = readNamespacedArg(args, namespace, key);
    if (value !== undefined) {
      extracted[key] = value;
    }
  }

  return Object.keys(extracted).length > 0 ? (extracted as TArgs) : undefined;
}

export function sanitizeNamespacedArgs(
  args: Record<string, unknown>,
  namespace: string,
  keys: readonly string[],
): Record<string, unknown> {
  const excludedKeys = new Set<string>(getKeyAliases(namespace));

  for (const key of keys) {
    for (const alias of getKeyAliases(key)) {
      excludedKeys.add(alias);
    }

    for (const alias of getKeyAliases(`${namespace}.${key}`)) {
      excludedKeys.add(alias);
    }
  }

  return Object.fromEntries(
    Object.entries(args).filter(([key]) => !excludedKeys.has(key)),
  );
}

/**
 * Build a flat MCP tool schema whose keys are dotted `"<namespace>.<field>"`.
 *
 * We intentionally stay flat (rather than `{ namespace: z.object({...}) }`) so
 * that CLI (`--android.device-id`), MCP clients, and `--help` output all share
 * the same spelling. `readNamespacedArg` understands all three input shapes:
 * nested namespace object, dotted flat key, and bare key fallback.
 */
export function createNamespacedInitArgSchema(
  namespace: string,
  shape: Record<string, z.ZodTypeAny>,
): ToolSchema {
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [`${namespace}.${key}`, value]),
  );
}
