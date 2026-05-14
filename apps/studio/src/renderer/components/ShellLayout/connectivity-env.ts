import {
  type ModelConnectionParams,
  resolveModelConnection as resolveStudioModelConnection,
} from '../../../shared/model-connection';

export type { ModelConnectionParams };

export interface EnvEntry {
  key: string;
  value: string;
}

export interface ModelEnvField {
  key: string;
  placeholder: string;
}

/**
 * The canonical fields the Studio env modal asks for. Everything the agent
 * needs to talk to a remote VL model is covered here; arbitrary user-defined
 * variables are still preserved through the Text tab but no longer surface
 * as editable rows in the Form tab.
 */
export const FIXED_MODEL_ENV_FIELDS: readonly ModelEnvField[] = [
  {
    key: 'MIDSCENE_MODEL_BASE_URL',
    placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    key: 'MIDSCENE_MODEL_API_KEY',
    placeholder: 'sk-...',
  },
  {
    key: 'MIDSCENE_MODEL_NAME',
    placeholder: 'qwen3-vl-plus',
  },
  {
    key: 'MIDSCENE_MODEL_FAMILY',
    placeholder: 'qwen3-vl',
  },
] as const;

/**
 * Returns true when the parsed env text can resolve the required connection
 * params. The Form tab still exposes the preferred MIDSCENE_MODEL_* keys, but
 * saved env text may use compatible aliases such as OPENAI_API_KEY.
 */
export function hasCompleteModelEnvConfig(text: string): boolean {
  const env = parseEnvText(text);
  return !('error' in resolveModelConnection(env));
}

/**
 * Patch a single env field's value while preserving the order and any other
 * keys the user typed in the Text tab. Empty values clear the entry rather
 * than serialising as `KEY=` so the resulting text stays clean.
 */
export function setEnvFieldValue(
  text: string,
  key: string,
  value: string,
): string {
  const entries = parseEnvEntries(text);
  const index = entries.findIndex((entry) => entry.key === key);
  const trimmed = value;
  if (trimmed === '') {
    if (index >= 0) {
      entries.splice(index, 1);
    }
  } else if (index >= 0) {
    entries[index] = { key, value: trimmed };
  } else {
    entries.push({ key, value: trimmed });
  }
  return serializeEnvEntries(entries);
}

export function parseEnvEntries(text: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = unquoteValue(value);
    }
    if (key) {
      entries.push({ key, value });
    }
  }
  return entries;
}

export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const { key, value } of parseEnvEntries(text)) {
    env[key] = value;
  }
  return env;
}

export function serializeEnvEntries(entries: EnvEntry[]): string {
  return entries
    .map(({ key, value }) => `${key}=${quoteValueIfNeeded(value)}`)
    .join('\n');
}

function quoteValueIfNeeded(value: string): string {
  if (value === '') {
    return '';
  }
  if (/[\s"'#=]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function unquoteValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return unquoteSingleQuotedValue(value.slice(1, -1));
}

function unquoteSingleQuotedValue(value: string): string {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const currentChar = value[index];

    if (currentChar !== '\\' || index === value.length - 1) {
      result += currentChar;
      continue;
    }

    const nextChar = value[index + 1];

    if (nextChar === "'" || nextChar === '\\') {
      result += nextChar;
      index += 1;
      continue;
    }

    result += `\\${nextChar}`;
    index += 1;
  }

  return result;
}

export const resolveModelConnection = resolveStudioModelConnection;
