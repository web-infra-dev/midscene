import { notification } from 'antd';

export interface NotifyErrorOptions {
  /** Short, descriptive label rendered as the toast title. */
  title?: string;
  /** Custom body text; defaults to the normalized error message. */
  description?: string;
  /** Seconds before auto-dismiss. Mirrors antd's default of 4.5. */
  duration?: number;
}

const DEFAULT_TITLE = 'Something went wrong';

function normalizeMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.toString();
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string') {
      return value;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Project-wide error toast. Consolidates the ad-hoc `message.error(...)`
 * calls that used to pop a full-width banner at the top of the window — the
 * playground and shell now share a single bottom-right notification format,
 * so a series of failures stack instead of clobbering the chrome.
 */
export function notifyError(
  error: unknown,
  options: NotifyErrorOptions = {},
): void {
  notification.error({
    message: options.title ?? DEFAULT_TITLE,
    description: options.description ?? normalizeMessage(error),
    placement: 'bottomRight',
    duration: options.duration ?? 5,
  });
}
