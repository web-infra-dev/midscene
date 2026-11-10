import type { FreeFn } from '@/types';

export async function runFreeFnCleanup(freeFn: FreeFn[]): Promise<void> {
  const errors: unknown[] = [];

  for (const cleanup of freeFn) {
    try {
      await cleanup.fn();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      'Multiple resource cleanup operations failed',
    );
  }
}
