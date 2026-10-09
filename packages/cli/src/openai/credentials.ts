import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface OpenAICredentials {
  ext_agent_host_id: string;
  client_id: string;
  subject: string;
  issuer: string;
  email?: string;
  access_token: string;
  refresh_token: string;
  id_token: string;
  scopes: string[];
  expires_at: number;
}

export type Registration = Pick<OpenAICredentials, 'ext_agent_host_id'> &
  Partial<OpenAICredentials>;

export const defaultCredentialsPath = () =>
  join(homedir(), '.midscene', 'siwc.json');

export async function readRegistration(
  path: string,
): Promise<Registration | undefined> {
  const content = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw new Error('Unable to read the local SIWC credentials file.');
  });
  if (content === undefined) {
    return undefined;
  }
  try {
    const value = JSON.parse(content);
    if (
      !value ||
      typeof value.ext_agent_host_id !== 'string' ||
      !value.ext_agent_host_id
    ) {
      throw new Error('Missing host ID');
    }
    return value;
  } catch {
    throw new Error('Invalid local SIWC credentials file.');
  }
}

export async function saveRegistration(path: string, value: Registration) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Hold the lock across reading, refreshing and replacing rotating credentials. */
export async function lockCredentials(
  path: string,
): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Another SIWC command holds ${lockPath}. If it was interrupted, remove this lock only after confirming that no SIWC command is running.`,
      );
    }
    throw new Error('Unable to lock the local SIWC credentials file.');
  }
  return () => rm(lockPath, { recursive: true, force: true });
}

export function requireCredentials(
  value: Registration | undefined,
): OpenAICredentials {
  if (
    !value ||
    [
      'client_id',
      'subject',
      'issuer',
      'access_token',
      'refresh_token',
      'id_token',
    ].some(
      (key) =>
        typeof value[key as keyof Registration] !== 'string' ||
        !value[key as keyof Registration],
    ) ||
    !Array.isArray(value.scopes) ||
    !value.scopes.every((scope) => typeof scope === 'string') ||
    !Number.isFinite(value.expires_at)
  ) {
    throw new Error(
      'No valid SIWC credentials. Run midscene model siwc login first.',
    );
  }
  return value as OpenAICredentials;
}
