export const DEFAULT_DOWNLOAD_MAX_RETRIES = 6;
export const DEFAULT_DOWNLOAD_RETRY_DELAY_MS = 2000;
export const MAX_DOWNLOAD_RETRY_DELAY_MS = 30000;

export function getDownloadMaxRetries(env = process.env) {
  const value = Number.parseInt(
    env.MIDSCENE_ANDROID_DOWNLOAD_RETRIES ?? '',
    10,
  );
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_DOWNLOAD_MAX_RETRIES;
}

export function getDownloadRetryDelayMs(
  attempt,
  baseDelayMs = DEFAULT_DOWNLOAD_RETRY_DELAY_MS,
  maxDelayMs = MAX_DOWNLOAD_RETRY_DELAY_MS,
) {
  const normalizedAttempt = Math.max(1, attempt);
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (normalizedAttempt - 1));
}

export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryDownload({
  download,
  label,
  log = console.log,
  maxRetries = DEFAULT_DOWNLOAD_MAX_RETRIES,
  sleepImpl = sleep,
}) {
  const attempts = Math.max(1, Math.floor(maxRetries));

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await download();
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }

      const delayMs = getDownloadRetryDelayMs(attempt);
      log(
        `[${label}] Download attempt ${attempt}/${attempts} failed: ${getErrorMessage(error)}, retrying in ${
          delayMs / 1000
        }s...`,
      );
      await sleepImpl(delayMs);
    }
  }
}
