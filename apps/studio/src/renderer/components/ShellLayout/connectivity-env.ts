export interface ModelConnectionParams {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface EnvEntry {
  key: string;
  value: string;
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
      value = value.slice(1, -1);
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
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  return value;
}

export function resolveModelConnection(
  env: Record<string, string>,
): ModelConnectionParams | { error: string } {
  const apiKey = env.MIDSCENE_MODEL_API_KEY || env.OPENAI_API_KEY || '';
  const baseUrl = env.MIDSCENE_MODEL_BASE_URL || env.OPENAI_BASE_URL || '';
  const model =
    env.MIDSCENE_MODEL_NAME || env.MIDSCENE_MODEL || env.OPENAI_MODEL || '';

  const missing: string[] = [];
  if (!apiKey) missing.push('OPENAI_API_KEY');
  if (!baseUrl) missing.push('OPENAI_BASE_URL');
  if (!model) missing.push('MIDSCENE_MODEL_NAME');

  if (missing.length > 0) {
    return { error: `Missing required keys: ${missing.join(', ')}` };
  }

  return { apiKey, baseUrl, model };
}
